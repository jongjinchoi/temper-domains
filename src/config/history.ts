import { homedir } from "node:os";
import { join } from "node:path";
import { ensureConfigDir, readValidatedJson, writeJson } from "../utils/fs.ts";

const HISTORY_FILE = join(homedir(), ".temper", "history.json");
const MAX_ENTRIES = 100;

export interface HistoryEntry {
  query: string;
  timestamp: string;
  available: number;
  total: number;
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

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const history = await loadHistory();
  history.unshift(entry);
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  await ensureConfigDir();
  await writeJson(HISTORY_FILE, history);
}

export async function removeHistoryAt(index: number): Promise<void> {
  const history = await loadHistory();
  history.splice(index, 1);
  await ensureConfigDir();
  await writeJson(HISTORY_FILE, history);
}
