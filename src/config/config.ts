import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { lstat, open, readlink, realpath, rename, unlink, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
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
  const deadline = Date.now() + 5000;
  let lock: FileHandle;
  while (true) {
    try {
      lock = await open(lockPath, "wx", 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error(`Config is busy: ${lockPath}. ${recovery}`);
      await delay(25);
    }
  }

  let temporary: string | undefined;
  let file: FileHandle | undefined;
  let committed = false;
  let lockCleanupFailed = false;
  const errors: unknown[] = [];
  try {
    await lock.writeFile(`${process.pid}\n`);
    const merged = { ...await readConfig(path), ...partial };
    const candidate = `${path}.${randomUUID()}.tmp`;
    file = await open(candidate, "wx", 0o600);
    temporary = candidate;
    await file.writeFile(JSON.stringify(merged, null, 2) + "\n", "utf8");
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, path);
    committed = true;
  } catch (error) {
    errors.push(error);
  } finally {
    if (file) await file.close().catch(error => { errors.push(error); });
    if (temporary) await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") errors.push(error);
    });
    await lock.close().catch(error => { errors.push(error); });
    await unlink(lockPath).catch(error => { lockCleanupFailed = true; errors.push(error); });
  }
  if (errors.length) {
    const reason = errors.map(error => error instanceof Error ? error.message : String(error)).join("; ");
    const cleanup = lockCleanupFailed
      ? ` After confirming no temper command is running, remove only ${lockPath} before the next save.`
      : "";
    throw new ConfigSaveError(`${committed ? "Config was saved, but cleanup failed" : "Config was not saved"}: ${reason}${cleanup}`, committed);
  }
}
