import { mkdir, readFile, writeFile, access, stat as fsStat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".temper");

export async function ensureConfigDir(): Promise<string> {
  await mkdir(CONFIG_DIR, { recursive: true });
  return CONFIG_DIR;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  if (!(await fileExists(path))) return null;
  try {
    const data = await readFile(path, "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function fileStat(path: string) {
  return fsStat(path);
}
