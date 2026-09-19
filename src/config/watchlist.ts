import { homedir } from "node:os";
import { join } from "node:path";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { ensureConfigDir } from "../utils/fs.ts";
import { isValidDomain, sanitizeDomain } from "../utils/validate.ts";

const WATCHLIST_FILE = join(homedir(), ".temper", "watchlist.json");

export interface WatchEntry {
  domain: string;
  addedAt: string;
}

export async function loadWatchlist(): Promise<WatchEntry[]> {
  let raw: string;
  try {
    raw = await readFile(WATCHLIST_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  try {
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || !entries.every((entry) =>
      entry !== null && typeof entry === "object" &&
      typeof entry.domain === "string" && isValidDomain(entry.domain) &&
      typeof entry.addedAt === "string" && Number.isFinite(Date.parse(entry.addedAt))
    )) throw new Error("Invalid watchlist entries");
    return entries.map((entry) => ({ ...entry, domain: entry.domain.toLowerCase() }));
  } catch {
    throw new Error(`Invalid watchlist: ${WATCHLIST_FILE}. Back up and repair this file before retrying; it has not been overwritten.`);
  }
}

async function saveWatchlist(entries: WatchEntry[]): Promise<void> {
  const temporary = `${WATCHLIST_FILE}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(entries, null, 2) + "\n", "utf8");
    await file.sync();
    await file.close();
    await rename(temporary, WATCHLIST_FILE);
  } finally {
    await file.close();
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function updateWatchlist(update: (entries: WatchEntry[]) => WatchEntry[]): Promise<void> {
  await ensureConfigDir();
  const lockPath = `${WATCHLIST_FILE}.lock`;
  const deadline = Date.now() + 5000;
  let lock;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(`Watchlist is busy: ${lockPath}. Retry after other temper commands finish. If a command crashed, remove only this lock file after confirming no temper command is running.`);
      }
      await delay(25);
    }
  }
  try {
    await lock.writeFile(`${process.pid}\n`);
    await saveWatchlist(update(await loadWatchlist()));
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

export async function addWatch(input: string): Promise<void> {
  const domain = sanitizeDomain(input).toLowerCase();
  if (!isValidDomain(domain)) throw new Error("Invalid watchlist domain");
  await updateWatchlist((list) => list.some((entry) => entry.domain === domain)
    ? list
    : [...list, { domain, addedAt: new Date().toISOString() }]);
}

export async function removeWatch(domain: string): Promise<void> {
  const normalized = sanitizeDomain(domain).toLowerCase();
  await updateWatchlist((list) => list.filter((entry) => entry.domain !== normalized));
}
