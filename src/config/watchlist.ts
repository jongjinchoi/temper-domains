import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readJson, writeJson } from "../utils/fs.ts";

const WATCHLIST_FILE = join(homedir(), ".temper", "watchlist.json");

export interface WatchEntry {
  domain: string;
  addedAt: string;
}

export async function loadWatchlist(): Promise<WatchEntry[]> {
  return (await readJson<WatchEntry[]>(WATCHLIST_FILE)) ?? [];
}

async function saveWatchlist(entries: WatchEntry[]): Promise<void> {
  await mkdir(join(homedir(), ".temper"), { recursive: true });
  await writeJson(WATCHLIST_FILE, entries);
}

export async function addWatch(domain: string): Promise<void> {
  const list = await loadWatchlist();
  if (list.some((e) => e.domain === domain)) return;
  list.push({ domain, addedAt: new Date().toISOString() });
  await saveWatchlist(list);
}

export async function removeWatch(domain: string): Promise<void> {
  const list = await loadWatchlist();
  const filtered = list.filter((e) => e.domain !== domain);
  await saveWatchlist(filtered);
}
