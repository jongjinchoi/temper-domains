import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const HISTORY_FILE = join(homedir(), ".temper", "history.json");
const MAX_ENTRIES = 100;

export interface HistoryEntry {
  query: string;
  timestamp: string;
  available: number;
  total: number;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const file = Bun.file(HISTORY_FILE);
  if (!(await file.exists())) return [];
  try {
    return await file.json();
  } catch {
    return [];
  }
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const history = await loadHistory();
  history.unshift(entry);
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  await mkdir(join(homedir(), ".temper"), { recursive: true });
  await Bun.write(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n");
}

export async function removeHistoryAt(index: number): Promise<void> {
  const history = await loadHistory();
  history.splice(index, 1);
  await mkdir(join(homedir(), ".temper"), { recursive: true });
  await Bun.write(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n");
}
