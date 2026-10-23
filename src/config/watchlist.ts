import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { domainToASCII } from "node:url";
import { withFileTransaction } from "../utils/file-transaction.ts";
import { ensureConfigDir } from "../utils/fs.ts";
import { isValidDomain, sanitizeDomain } from "../utils/validate.ts";
import { getDomainInputError } from "../checker/policy.ts";
import { isAnswered } from "../checker/retry.ts";
import type { DomainResult } from "../checker/types.ts";

const WATCHLIST_FILE = join(homedir(), ".temper", "watchlist.json");

type AnsweredStatus = "available" | "taken" | "premium" | "reserved";

// Saved results describe the last answered check; they are not refreshed by reading.
export interface WatchEntry {
  domain: string;
  addedAt: string;
  lastStatus?: AnsweredStatus;
  checkedAt?: string;
  expiryDate?: string;
  registrar?: string;
  previousStatus?: AnsweredStatus;
  statusChangedAt?: string;
}

const ANSWERED: readonly string[] = ["available", "taken", "premium", "reserved"];
const isTime = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const SAVED_FIELDS: Record<string, (value: unknown) => boolean> = {
  lastStatus: value => ANSWERED.includes(value as string),
  previousStatus: value => ANSWERED.includes(value as string),
  checkedAt: isTime,
  statusChangedAt: isTime,
  expiryDate: value => typeof value === "string" && value.length > 0,
  registrar: value => typeof value === "string" && value.length > 0,
};

// A damaged saved result is dropped rather than blocking the list; unknown fields are kept.
function readEntry(entry: Record<string, unknown>): WatchEntry {
  const clean: Record<string, unknown> = { ...entry, domain: (entry.domain as string).toLowerCase() };
  for (const [field, valid] of Object.entries(SAVED_FIELDS)) if (field in clean && !valid(clean[field])) delete clean[field];
  return clean as unknown as WatchEntry;
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
    return entries.map(readEntry);
  } catch {
    throw new Error(`Invalid watchlist: ${WATCHLIST_FILE}. Back up and repair this file before retrying; it has not been overwritten.`);
  }
}

async function updateWatchlist(update: (entries: WatchEntry[]) => WatchEntry[]): Promise<number> {
  let removed = 0;
  await ensureConfigDir();
  const lockPath = `${WATCHLIST_FILE}.lock`;
  await withFileTransaction(WATCHLIST_FILE, {
    subject: "Watchlist",
    deadline: Date.now() + 5000,
    busyMessage: `Watchlist is busy: ${lockPath}. Retry after other temper commands finish. If a command crashed, remove only this lock file after confirming no temper command is running.`,
  }, async transaction => {
    const entries = await loadWatchlist();
    const next = update(entries);
    removed = entries.length - next.length;
    await transaction.replace(JSON.stringify(next, null, 2) + "\n");
  });
  return removed;
}

// Unicode and punycode spellings of one domain share a key. Entries keep the
// spelling they were added with; text that does not convert keeps its own key
// so legacy entries stay removable.
export function watchKey(domain: string): string {
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

// Saves answered results onto entries that are still watched; never adds an entry,
// so a domain removed during the check stays removed. Unresolved rows keep the
// saved answer. Registration details are kept only for taken domains. Resolves
// the saved list, or undefined when nothing was answered and nothing was written.
export async function recordWatchResults(results: readonly DomainResult[]): Promise<WatchEntry[] | undefined> {
  const answered = new Map(results.filter(isAnswered).map(result => [watchKey(result.domain), result]));
  if (!answered.size) return undefined;
  let saved: WatchEntry[] = [];
  await updateWatchlist(list => saved = list.map(entry => {
    const result = answered.get(watchKey(entry.domain));
    if (!result) return entry;
    const { expiryDate, registrar, ...rest } = entry;
    const status = result.status as AnsweredStatus;
    const checkedAt = result.checkedAt ?? new Date().toISOString();
    const changed = entry.lastStatus !== undefined && entry.lastStatus !== status;
    return {
      ...rest, lastStatus: status, checkedAt,
      ...(status === "taken" && result.expiryDate ? { expiryDate: result.expiryDate } : {}),
      ...(status === "taken" && result.registrar ? { registrar: result.registrar } : {}),
      ...(changed ? { previousStatus: entry.lastStatus, statusChangedAt: checkedAt } : {}),
    };
  }));
  return saved;
}

// Available now (or at the saved check) after an earlier check found it taken.
export function freedSince(entry: Pick<WatchEntry, "lastStatus" | "previousStatus">, status: string | undefined = entry.lastStatus): boolean {
  if (status !== "available") return false;
  return entry.lastStatus === "taken" || (entry.lastStatus === "available" && entry.previousStatus === "taken");
}

// Resolves true when an entry was removed, false when none matched.
export async function removeWatch(domain: string): Promise<boolean> {
  const key = watchKey(domain);
  return await updateWatchlist((list) => list.filter((entry) => watchKey(entry.domain) !== key)) > 0;
}
