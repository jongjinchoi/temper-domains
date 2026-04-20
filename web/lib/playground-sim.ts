// Deterministic browser-sandbox simulation. Mirrors the hash and
// scoring in the v4-zine prototype so output matches byte-for-byte.

export const TLDS = [
  ".com", ".io", ".dev", ".app", ".ai", ".co", ".xyz", ".net",
  ".sh", ".org", ".me", ".so", ".gg", ".cloud", ".tech",
] as const;

const KNOWN = new Set(["google", "apple", "github", "twitter", "example", "test"]);

const PRICES: Record<string, number> = {
  ".com": 11, ".io": 34, ".dev": 12, ".app": 14, ".ai": 78,
  ".co": 28, ".xyz": 10, ".net": 11, ".sh": 58, ".org": 11,
  ".me": 18, ".so": 45, ".gg": 65, ".cloud": 8, ".tech": 16,
};

const REGISTRARS = ["Porkbun", "Cloudflare", "Namecheap"];

/** FNV-1a 32-bit, unsigned. */
export function fnv(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function isAvailable(name: string, tld: string): boolean {
  if (KNOWN.has(name.toLowerCase())) {
    return tld !== ".com" && fnv(name + tld) % 100 < 60;
  }
  const bar = name.length <= 4 ? 35 : name.length <= 6 ? 62 : 78;
  return fnv(name + tld) % 100 < bar;
}

export function priceFor(name: string, tld: string): number {
  const base = PRICES[tld] ?? 12;
  return base + (fnv(name + tld + "p") % 4);
}

export function registrarFor(name: string, tld: string): string {
  return REGISTRARS[fnv(name + tld + "r") % REGISTRARS.length]!;
}

export function padTo(s: string, n: number): string {
  return s.length >= n ? s + " " : s + " ".repeat(n - s.length);
}

export function elapsedSeconds(): string {
  // 0.8–1.7s, same distribution as the prototype banner.
  return (0.8 + Math.random() * 0.9).toFixed(1);
}

export interface Row {
  full: string;
  available: boolean;
  price?: number;
}

export function runSearch(name: string): Row[] {
  return TLDS.map((tld) => ({
    full: `${name}${tld}`,
    available: isAvailable(name, tld),
    price: isAvailable(name, tld) ? priceFor(name, tld) : undefined,
  }));
}
