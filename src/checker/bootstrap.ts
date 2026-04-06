import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) return false;
  const stat = await file.stat();
  return Date.now() - stat.mtime.getTime() < CACHE_TTL_MS;
}

async function readCache(): Promise<BootstrapData | null> {
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) return null;
  return file.json();
}

async function writeCache(data: BootstrapData): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await Bun.write(CACHE_FILE, JSON.stringify(data));
}

async function fetchBootstrap(): Promise<BootstrapData> {
  const res = await fetch(BOOTSTRAP_URL);
  if (!res.ok) throw new Error(`Bootstrap fetch failed: ${res.status}`);
  return res.json();
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
