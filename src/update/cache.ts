import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DAY_MS, FAILURE_BACKOFF_MS, parseStableVersion } from "./policy.ts";

export interface UpdateCache {
  schema: 1;
  key: string;
  identity: string | null;
  channel: "npm" | "homebrew" | null;
  attemptedAt: number;
  checkedAt: number;
  postponedAt: number;
  latest: string | null;
  failed: boolean;
}

export async function loadUpdateCache(path: string): Promise<UpdateCache | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as UpdateCache;
    if (!value || value.schema !== 1 || typeof value.key !== "string" || typeof value.failed !== "boolean" ||
      !(value.identity === null || typeof value.identity === "string") ||
      ![null, "npm", "homebrew"].includes(value.channel) ||
      ![value.attemptedAt, value.checkedAt, value.postponedAt].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !(value.latest === null || parseStableVersion(value.latest))) return null;
    return value;
  } catch { return null; }
}

export async function saveUpdateCache(path: string, value: UpdateCache): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch { /* A disposable version cache must not break domain searches. */ }
  finally { await unlink(temporary).catch(() => {}); }
}

export function cacheDecision(value: UpdateCache | null, key: string, now: number): "check" | "cached" | "skip" {
  if (!value || value.key !== key || [value.checkedAt, value.attemptedAt, value.postponedAt].some(t => t > now)) return "check";
  if (value.postponedAt > 0 && now - value.postponedAt < DAY_MS) return "skip";
  if (value.failed) return now - value.attemptedAt < FAILURE_BACKOFF_MS ? "skip" : "check";
  return value.checkedAt > 0 && now - value.checkedAt < DAY_MS ? "cached" : "check";
}
