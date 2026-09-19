import { homedir } from "node:os";
import { join } from "node:path";
import { ensureConfigDir, readValidatedJson, writeJson } from "../utils/fs.ts";

const CONFIG_FILE = join(homedir(), ".temper", "config.json");

export interface TemperConfig {
  theme: string;
  registrar: string;
}

const DEFAULTS: TemperConfig = {
  theme: "temper-forge",
  registrar: "cloudflare",
};

export async function loadConfig(): Promise<TemperConfig> {
  const data = await readValidatedJson(CONFIG_FILE, (value): value is Partial<TemperConfig> => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const config = value as Record<string, unknown>;
    return (config.theme === undefined || typeof config.theme === "string") &&
      (config.registrar === undefined || typeof config.registrar === "string");
  });
  if (!data) return { ...DEFAULTS };
  return { ...DEFAULTS, ...data };
}

export async function saveConfig(partial: Partial<TemperConfig>): Promise<void> {
  const current = await loadConfig();
  const merged = { ...current, ...partial };
  await ensureConfigDir();
  await writeJson(CONFIG_FILE, merged);
}
