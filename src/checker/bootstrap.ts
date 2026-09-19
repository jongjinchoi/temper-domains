import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { findRdapBootstrapKey } from "../utils/domain.ts";
import { createBootstrapCache } from "./bootstrap-cache.ts";

const CACHE_DIR = join(homedir(), ".temper", "cache");
const CACHE_FILE = join(CACHE_DIR, "rdap-dns.json");
const cache = createBootstrapCache({
  async read() {
    try { return JSON.parse(await readFile(CACHE_FILE, "utf8")); } catch { return undefined; }
  },
  async write(snapshot) {
    await mkdir(CACHE_DIR, { recursive: true });
    const temporary = `${CACHE_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(snapshot) + "\n", { flag: "wx" });
      await rename(temporary, CACHE_FILE);
    } finally { await rm(temporary, { force: true }); }
  },
  async remove() { await rm(CACHE_FILE, { force: true }); },
});
let bootstrapMap: Map<string, string> | undefined;
export async function getBootstrap(): Promise<Map<string, string>> {
  bootstrapMap = await cache.get();
  return bootstrapMap;
}
export interface RdapBootstrapMatch { rdapKey: string; rdapUrl: string | null }
export function getRdapMatch(domain: string): RdapBootstrapMatch {
  const rdapKey = findRdapBootstrapKey(domain, key => bootstrapMap?.has(key) ?? false);
  return { rdapKey, rdapUrl: bootstrapMap?.get(rdapKey) ?? null };
}
