import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readJson, writeJson } from "../utils/fs.ts";

const CONFIG_DIR = join(homedir(), ".temper");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface TemperConfig {
  theme: string;
  registrar: string;
}

const DEFAULTS: TemperConfig = {
  theme: "temper-forge",
  registrar: "cloudflare",
};

export async function loadConfig(): Promise<TemperConfig> {
  const data = await readJson<Partial<TemperConfig>>(CONFIG_FILE);
  if (!data) return { ...DEFAULTS };
  return { ...DEFAULTS, ...data };
}

export async function saveConfig(partial: Partial<TemperConfig>): Promise<void> {
  const current = await loadConfig();
  const merged = { ...current, ...partial };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeJson(CONFIG_FILE, merged);
}
