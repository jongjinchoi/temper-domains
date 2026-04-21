// Serverless-friendly IANA RDAP bootstrap cache. The CLI version writes to
// ~/.temper/cache which is unusable on Vercel; this keeps the registry in
// module scope and refetches once per TTL.

const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";

interface BootstrapData {
  services: [string[], string[]][];
}

let mapPromise: Promise<Map<string, string>> | null = null;
let cachedAt = 0;

export async function getBootstrap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (mapPromise && now - cachedAt < TTL_MS) return mapPromise;
  cachedAt = now;
  mapPromise = fetchAndParse().catch((err) => {
    mapPromise = null;
    cachedAt = 0;
    throw err;
  });
  return mapPromise;
}

async function fetchAndParse(): Promise<Map<string, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(BOOTSTRAP_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`IANA bootstrap HTTP ${res.status}`);
    const data = (await res.json()) as BootstrapData;
    return parseBootstrap(data);
  } finally {
    clearTimeout(timer);
  }
}

function parseBootstrap(data: BootstrapData): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of data.services) {
    const tlds = entry[0];
    const urls = entry[1];
    const url = urls[0];
    if (!url) continue;
    for (const tld of tlds) map.set(tld.toLowerCase(), url);
  }
  return map;
}

export function getRdapUrl(map: Map<string, string>, tld: string): string | null {
  return map.get(tld.toLowerCase()) ?? null;
}
