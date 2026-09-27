import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".temper");

export async function ensureConfigDir(): Promise<string> {
  await mkdir(CONFIG_DIR, { recursive: true });
  return CONFIG_DIR;
}

// User data must not silently become an empty/default value on parse failure.
export async function readValidatedJson<T>(path: string, validate: (value: unknown) => value is T): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!validate(data)) throw new Error("Invalid structure");
    return data;
  } catch {
    throw new Error(`Invalid data in ${path}. Back up and repair this file before retrying; it has not been overwritten.`);
  }
}
