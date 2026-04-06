import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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
  const file = Bun.file(CONFIG_FILE);
  if (!(await file.exists())) return { ...DEFAULTS };

  try {
    const data = await file.json();
    return { ...DEFAULTS, ...data };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveConfig(partial: Partial<TemperConfig>): Promise<void> {
  const current = await loadConfig();
  const merged = { ...current, ...partial };
  await mkdir(CONFIG_DIR, { recursive: true });
  await Bun.write(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n");
}
