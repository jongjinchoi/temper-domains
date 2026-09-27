import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { withFileTransaction } from "../utils/file-transaction.ts";
import { ensureConfigDir } from "../utils/fs.ts";
import { isValidDomain, sanitizeDomain } from "../utils/validate.ts";
import { getDomainInputError } from "../checker/policy.ts";

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

async function updateWatchlist(update: (entries: WatchEntry[]) => WatchEntry[]): Promise<void> {
  await ensureConfigDir();
  const lockPath = `${WATCHLIST_FILE}.lock`;
  await withFileTransaction(WATCHLIST_FILE, {
    deadline: Date.now() + 5000,
    busyMessage: `Watchlist is busy: ${lockPath}. Retry after other temper commands finish. If a command crashed, remove only this lock file after confirming no temper command is running.`,
  }, async transaction => {
    await transaction.replace(JSON.stringify(update(await loadWatchlist()), null, 2) + "\n");
  });
}

export async function addWatch(input: string): Promise<void> {
  const domain = sanitizeDomain(input).toLowerCase();
  const inputError = getDomainInputError(domain);
  if (inputError) throw new Error(`Invalid watchlist domain: ${inputError}`);
  await updateWatchlist((list) => list.some((entry) => entry.domain === domain)
    ? list
    : [...list, { domain, addedAt: new Date().toISOString() }]);
}

export async function removeWatch(domain: string): Promise<void> {
  const normalized = sanitizeDomain(domain).toLowerCase();
  await updateWatchlist((list) => list.filter((entry) => entry.domain !== normalized));
}
