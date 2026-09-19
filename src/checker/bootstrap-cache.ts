// HTTP freshness/revalidation shared by the CLI disk cache and web memory cache.
export const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
interface BootstrapData { services: [string[], string[]][] }
export interface BootstrapSnapshot {
  version: 1;
  data: BootstrapData;
  headers: Record<string, string>;
  freshUntil: number;
}
export interface BootstrapStorage {
  read(): Promise<unknown>;
  write(snapshot: BootstrapSnapshot): Promise<void>;
  remove(): Promise<void>;
}
export class BootstrapRegistry extends Map<string, string> {
  readonly endpoints = new Map<string, readonly string[]>();
}
export function parseBootstrap(value: unknown): BootstrapRegistry {
  if (!value || typeof value !== "object" || !Array.isArray((value as BootstrapData).services)) throw new Error("Invalid IANA bootstrap data");
  const map = new BootstrapRegistry();
  for (const entry of (value as BootstrapData).services) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Array.isArray(entry[0]) || !Array.isArray(entry[1]) ||
      !entry[0].length || !entry[1].length || entry[0].some(key => typeof key !== "string" || !key)) throw new Error("Invalid IANA bootstrap service");
    const urls = entry[1].map(raw => {
      if (typeof raw !== "string") throw new Error("Invalid IANA bootstrap URL");
      const url = new URL(raw);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid IANA bootstrap URL");
      return url.href;
    }).sort((a, b) => Number(b.startsWith("https:")) - Number(a.startsWith("https:")));
    for (const key of entry[0]) { map.set(key.toLowerCase(), urls[0]!); map.endpoints.set(key.toLowerCase(), urls); }
  }
  if (!map.size) throw new Error("Empty IANA bootstrap data");
  return map;
}
const CACHE_HEADERS = ["cache-control", "date", "age", "expires", "etag", "last-modified"];
function freshness(headers: Record<string, string>, requestedAt: number, receivedAt: number): number {
  const control = headers["cache-control"] ?? "";
  if (/(?:^|,)\s*(?:no-cache|no-store)(?:\s*(?:,|=|$))/i.test(control)) return receivedAt;
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/i.exec(control);
  const date = Date.parse(headers.date ?? "");
  const expires = Date.parse(headers.expires ?? "");
  // No advertised freshness: revalidate on the next use, rather than invent a TTL.
  const lifetime = maxAge ? Number(maxAge[1]) * 1000 : Number.isFinite(expires) ? Math.max(0, expires - (Number.isFinite(date) ? date : receivedAt)) : 0;
  const apparentAge = Number.isFinite(date) ? Math.max(0, receivedAt - date) : 0;
  const age = /^\d+$/.test(headers.age ?? "") ? Number(headers.age) * 1000 : 0;
  const correctedAge = Math.max(apparentAge, age + Math.max(0, receivedAt - requestedAt));
  return receivedAt + Math.max(0, lifetime - correctedAge);
}
export function createBootstrapCache(storage?: BootstrapStorage) {
  let snapshot: BootstrapSnapshot | undefined;
  let registry: BootstrapRegistry | undefined;
  let loaded = false;
  let flight: Promise<BootstrapRegistry> | undefined;
  async function refresh(): Promise<BootstrapRegistry> {
    if (!loaded) {
      loaded = true;
      const saved = await storage?.read().catch(() => undefined);
      try {
        if (saved && typeof saved === "object" && "version" in saved && saved.version === 1) {
          const candidate = saved as BootstrapSnapshot;
          registry = parseBootstrap(candidate.data);
          if (!candidate.headers || typeof candidate.headers !== "object" ||
            Object.values(candidate.headers).some(value => typeof value !== "string") || !Number.isFinite(candidate.freshUntil)) throw new Error("Invalid bootstrap cache metadata");
          snapshot = candidate;
        } else if (saved) {
          registry = parseBootstrap(saved);
          snapshot = { version: 1, data: saved as BootstrapData, headers: {}, freshUntil: 0 };
        }
      } catch { snapshot = undefined; registry = undefined; }
    }
    if (snapshot && registry && Date.now() < snapshot.freshUntil) return registry;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (snapshot?.headers.etag) headers["If-None-Match"] = snapshot.headers.etag;
    if (snapshot?.headers["last-modified"]) headers["If-Modified-Since"] = snapshot.headers["last-modified"];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const requestedAt = Date.now();
    let response: Response | undefined;
    try {
      response = await fetch(BOOTSTRAP_URL, { headers, signal: controller.signal });
      if (response.status !== 304 && !response.ok) throw new Error(`IANA bootstrap HTTP ${response.status}`);
      if (response.status === 304 && !snapshot) throw new Error("IANA returned 304 without a cached representation");
      const data = response.status === 304 ? snapshot!.data : await response.json();
      const nextRegistry = parseBootstrap(data);
      const receivedAt = Date.now();
      const metadata: Record<string, string> = response.status === 304 ? { ...snapshot!.headers } : {};
      // Age and Date describe this validation response, not the previous response.
      delete metadata.age;
      delete metadata.date;
      for (const name of CACHE_HEADERS) {
        const value = response.headers.get(name);
        if (value !== null) metadata[name] = value;
      }
      const next: BootstrapSnapshot = { version: 1, data: data as BootstrapData, headers: metadata, freshUntil: freshness(metadata, requestedAt, receivedAt) };
      registry = nextRegistry;
      if (/(?:^|,)\s*no-store\b/i.test(metadata["cache-control"] ?? "")) {
        snapshot = undefined;
        await storage?.remove().catch(() => {});
      } else {
        snapshot = next;
        await storage?.write(next).catch(() => {});
      }
      return nextRegistry;
    } finally {
      clearTimeout(timer);
      await response?.body?.cancel().catch(() => {});
    }
  }
  return { get(): Promise<BootstrapRegistry> {
    // Single-flight refresh is independent of any one caller's cancellation.
    if (!flight) flight = refresh().finally(() => { flight = undefined; });
    return flight;
  }};
}
