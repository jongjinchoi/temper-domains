export type DomainStatus =
  | "available"
  | "taken"
  | "premium"
  | "reserved"
  | "rate_limited"
  | "error"
  | "slow";

export type CheckMethod = "rdap" | "whois";

export interface DomainResult {
  domain: string;
  tld: string;
  status: DomainStatus;
  method: CheckMethod;
  responseTime: number;
  error?: string;
}

export const DEFAULT_TLDS = [
  "com", "net", "org", "ai", "io", "xyz", "app", "shop", "info", "co",
  "store", "site", "online", "dev", "tech", "pro", "live", "lol", "club", "vip",
  "link", "top", "me", "tv", "blog", "cloud", "design", "studio", "art", "fun",
] as const;

export const EXTENDED_TLDS = [
  ...DEFAULT_TLDS,
  "one", "world", "digital", "global", "space", "plus",
  "media", "email", "host", "page", "ltd", "biz",
  "agency", "social", "stream", "zone", "website", "team",
  "work", "life", "love", "best", "cool", "today",
  "guru", "bio",
  "gg", "sh", "so",
] as const;

export const TLD_PRESETS: Record<string, readonly string[]> = {
  popular: ["com", "net", "org", "io", "co", "app", "dev", "ai", "me"],
  tech: ["io", "ai", "dev", "app", "gg", "sh", "tech", "cloud", "digital"],
  startup: ["com", "io", "co", "ai", "app", "dev", "xyz", "so", "gg"],
  cheap: ["xyz", "fun", "lol", "top", "site", "online", "store", "shop", "club"],
};

export const DEFAULT_PREFIXES = ["get", "use", "try", "my", "go", "join"] as const;
export const DEFAULT_SUFFIXES = ["app", "labs", "hq", "ly", "dev", "hub", "run", "kit"] as const;
