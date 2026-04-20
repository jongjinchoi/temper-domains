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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(BOOTSTRAP_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Bootstrap fetch failed: ${res.status}`);
    return await (res.json() as Promise<BootstrapData>);
  } finally {
    clearTimeout(timeout);
  }
}

function refreshInBackground(): void {
  fetchBootstrap()
    .then(async (data) => {
      await writeCache(data).catch(() => {});
      bootstrapMap = parseBootstrap(data);
    })
    .catch(() => {
      // Network failure during background refresh — keep stale map.
    });
}

export async function getBootstrap(): Promise<Map<string, string>> {
  if (bootstrapMap) return bootstrapMap;

  const cached = await readCache();
  if (cached) {
    bootstrapMap = parseBootstrap(cached);
    if (!(await isCacheValid())) refreshInBackground();
    return bootstrapMap;
  }

  // No cache: must fetch synchronously.
  const data = await fetchBootstrap();
  await writeCache(data);
  bootstrapMap = parseBootstrap(data);
  return bootstrapMap;
}

export function getRdapUrl(tld: string): string | null {
  return bootstrapMap?.get(tld.toLowerCase()) ?? null;
}
