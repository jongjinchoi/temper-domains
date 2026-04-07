import { readFile, writeFile, access, stat as fsStat } from "node:fs/promises";

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
  const data = await readFile(path, "utf-8");
  return JSON.parse(data) as T;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function fileStat(path: string) {
  return fsStat(path);
}
