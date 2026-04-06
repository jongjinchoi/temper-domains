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
