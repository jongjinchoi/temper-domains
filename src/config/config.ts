import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { lstat, readlink, realpath } from "node:fs/promises";
import { FileTransactionError, withFileTransaction } from "../utils/file-transaction.ts";
import { ensureConfigDir, readValidatedJson } from "../utils/fs.ts";

const CONFIG_FILE = join(homedir(), ".temper", "config.json");

export interface TemperConfig {
  theme: string;
  registrar: string;
}

const DEFAULTS: TemperConfig = {
  theme: "temper-forge",
  registrar: "cloudflare",
};

async function readConfig(path: string): Promise<TemperConfig> {
  const data = await readValidatedJson(path, (value): value is Partial<TemperConfig> => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const config = value as Record<string, unknown>;
    return (config.theme === undefined || typeof config.theme === "string") &&
      (config.registrar === undefined || typeof config.registrar === "string");
  });
  if (!data) return { ...DEFAULTS };
  return { ...DEFAULTS, ...data };
}

export async function loadConfig(): Promise<TemperConfig> {
  return readConfig(CONFIG_FILE);
}

export class ConfigSaveError extends Error {
  constructor(message: string, public readonly committed: boolean) {
    super(message);
    this.name = "ConfigSaveError";
  }
}

// Replace the target, not a user's symlink, including links to a missing file.
async function configTarget(): Promise<string> {
  let path = CONFIG_FILE;
  const visited = new Set<string>();
  while (true) {
    path = join(await realpath(dirname(path)), basename(path));
    if (visited.has(path)) throw new Error(`Config symlink loop: ${CONFIG_FILE}`);
    visited.add(path);
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info?.isSymbolicLink()) return path;
    path = resolve(dirname(path), await readlink(path));
  }
}

export async function saveConfig(partial: Partial<TemperConfig>): Promise<void> {
  await ensureConfigDir();
  const path = await configTarget();
  const lockPath = `${path}.lock`;
  const recovery = `Retry after other temper commands finish. If a command crashed, remove only ${lockPath} after confirming no temper command is running.`;
  try {
    await withFileTransaction(path, { deadline: Date.now() + 5000, busyMessage: `Config is busy: ${lockPath}. ${recovery}` }, async transaction => {
      const merged = { ...await readConfig(path), ...partial };
      await transaction.replace(JSON.stringify(merged, null, 2) + "\n");
    });
  } catch (error) {
    if (!(error instanceof FileTransactionError)) throw error;
    const cleanup = error.lockCleanupFailed
      ? ` After confirming no temper command is running, remove only ${lockPath} before the next save.` : "";
    const wrapped = new ConfigSaveError(`${error.committed ? "Config was saved, but cleanup failed" : "Config was not saved"}: ${error.message}${cleanup}`, error.committed);
    wrapped.cause = error;
    throw wrapped;
  }
}
