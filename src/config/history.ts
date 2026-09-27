import { homedir } from "node:os";
import { join } from "node:path";
import { withFileTransaction } from "../utils/file-transaction.ts";
import { ensureConfigDir, readValidatedJson } from "../utils/fs.ts";

const HISTORY_FILE = join(homedir(), ".temper", "history.json");
const MAX_ENTRIES = 100;

export interface HistoryEntry {
  query: string;
  timestamp: string;
  available: number;
  total: number;
}

export class HistoryConflictError extends Error {
  constructor(public readonly current: HistoryEntry[]) {
    super("History changed. The list has been refreshed; select the entry again before deleting.");
    this.name = "HistoryConflictError";
  }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  return (await readValidatedJson(HISTORY_FILE, (value): value is HistoryEntry[] =>
    Array.isArray(value) && value.every((entry) =>
      entry !== null && typeof entry === "object" &&
      typeof entry.query === "string" &&
      typeof entry.timestamp === "string" && Number.isFinite(Date.parse(entry.timestamp)) &&
      Number.isInteger(entry.available) && entry.available >= 0 &&
      Number.isInteger(entry.total) && entry.total >= entry.available
    ),
  )) ?? [];
}

async function updateHistory(update: (history: HistoryEntry[]) => HistoryEntry[]): Promise<HistoryEntry[]> {
  await ensureConfigDir();
  const lockPath = `${HISTORY_FILE}.lock`;
  return withFileTransaction(HISTORY_FILE, {
    subject: "History",
    deadline: Date.now() + 5000,
    busyMessage: `History is busy: ${lockPath}. Retry after other temper commands finish. If a command crashed, remove only this lock file after confirming no temper command is running.`,
  }, async transaction => {
    const history = update(await loadHistory());
    await transaction.replace(JSON.stringify(history, null, 2) + "\n");
    return history;
  });
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  await updateHistory(history => [entry, ...history].slice(0, MAX_ENTRIES));
}

export async function replaceHistoryEntry(expected: HistoryEntry, replacement: HistoryEntry): Promise<boolean> {
  let changed = false;
  await updateHistory(history => {
    const matches = history.map((entry, index) => JSON.stringify(entry) === JSON.stringify(expected) ? index : -1).filter(index => index >= 0);
    if (matches.length !== 1) return history;
    changed = true;
    return history.map((entry, index) => index === matches[0] ? replacement : entry);
  });
  return changed;
}

export async function removeHistoryAt(index: number, expected: readonly HistoryEntry[]): Promise<HistoryEntry[]> {
  return updateHistory(history => {
    if (JSON.stringify(history) !== JSON.stringify(expected)) throw new HistoryConflictError(history);
    if (!Number.isInteger(index) || index < 0 || index >= history.length) throw new Error("Invalid history selection");
    return history.filter((_, i) => i !== index);
  });
}
