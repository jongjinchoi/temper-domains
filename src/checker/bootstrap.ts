import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileExists, fileStat, readJson, writeJson } from "../utils/fs.ts";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const CACHE_DIR = join(homedir(), ".temper", "cache");
const CACHE_FILE = join(CACHE_DIR, "rdap-dns.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BootstrapData {
  services: [string[], string[]][];
}

let bootstrapMap: Map<string, string> | null = null;

function parseBootstrap(data: BootstrapData): Map<string, string> {
  const map = new Map<string, string>();
  for (const [tlds, urls] of data.services) {
    const baseUrl = urls[0];
    if (!baseUrl) continue;
    for (const tld of tlds) {
      map.set(tld.toLowerCase(), baseUrl);
    }
  }
  return map;
}

async function isCacheValid(): Promise<boolean> {
  if (!(await fileExists(CACHE_FILE))) return false;
  const s = await fileStat(CACHE_FILE);
  return Date.now() - s.mtime.getTime() < CACHE_TTL_MS;
}

async function readCache(): Promise<BootstrapData | null> {
  return readJson<BootstrapData>(CACHE_FILE);
}

async function writeCache(data: BootstrapData): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeJson(CACHE_FILE, data);
}

async function fetchBootstrap(): Promise<BootstrapData> {
  const res = await fetch(BOOTSTRAP_URL);
  if (!res.ok) throw new Error(`Bootstrap fetch failed: ${res.status}`);
  return res.json() as Promise<BootstrapData>;
}

export async function getBootstrap(): Promise<Map<string, string>> {
  if (bootstrapMap) return bootstrapMap;

  if (await isCacheValid()) {
    const cached = await readCache();
    if (cached) {
      bootstrapMap = parseBootstrap(cached);
      return bootstrapMap;
    }
  }

  try {
    const data = await fetchBootstrap();
    await writeCache(data);
    bootstrapMap = parseBootstrap(data);
    return bootstrapMap;
  } catch {
    // Offline fallback: use stale cache if available
    const stale = await readCache();
    if (stale) {
      bootstrapMap = parseBootstrap(stale);
      return bootstrapMap;
    }
    throw new Error("No bootstrap data available (offline and no cache)");
  }
}

export function getRdapUrl(tld: string): string | null {
  return bootstrapMap?.get(tld.toLowerCase()) ?? null;
}
