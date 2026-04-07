import { homedir } from "node:os";
import { join } from "node:path";
import { ensureConfigDir, readJson, writeJson } from "../utils/fs.ts";

const HISTORY_FILE = join(homedir(), ".temper", "history.json");
const MAX_ENTRIES = 100;

export interface HistoryEntry {
  query: string;
  timestamp: string;
  available: number;
  total: number;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  return (await readJson<HistoryEntry[]>(HISTORY_FILE)) ?? [];
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
