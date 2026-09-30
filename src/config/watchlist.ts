import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { domainToASCII } from "node:url";
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
    subject: "Watchlist",
    deadline: Date.now() + 5000,
    busyMessage: `Watchlist is busy: ${lockPath}. Retry after other temper commands finish. If a command crashed, remove only this lock file after confirming no temper command is running.`,
  }, async transaction => {
    await transaction.replace(JSON.stringify(update(await loadWatchlist()), null, 2) + "\n");
  });
}

// Unicode and punycode spellings of one domain share a key. Entries keep the
// spelling they were added with; text that does not convert keeps its own key
// so legacy entries stay removable.
function watchKey(domain: string): string {
  const clean = sanitizeDomain(domain).toLowerCase();
  return domainToASCII(clean).toLowerCase() || clean;
}

export async function addWatch(input: string): Promise<{ added: boolean; domain: string }> {
  const domain = sanitizeDomain(input).toLowerCase();
  const inputError = getDomainInputError(domain);
  if (inputError) throw new Error(`Invalid watchlist domain: ${inputError}`);
  const key = watchKey(domain);
  let existing: WatchEntry | undefined;
  await updateWatchlist((list) => {
    existing = list.find((entry) => watchKey(entry.domain) === key);
    return existing ? list : [...list, { domain, addedAt: new Date().toISOString() }];
  });
  return existing ? { added: false, domain: existing.domain } : { added: true, domain };
}

export async function removeWatch(domain: string): Promise<void> {
  const key = watchKey(domain);
  await updateWatchlist((list) => list.filter((entry) => watchKey(entry.domain) !== key));
}
