export type DomainStatus =
  | "available"
  | "taken"
  | "premium"
  | "reserved"
  | "rate_limited"
  | "error"
  | "slow";

export type CheckMethod = "rdap" | "whois";
export type ResultConfidence = "high" | "medium" | "low";

export type TerminationReason = "deadline_before_start" | "deadline" | "request_timeout"
  | "cancelled" | "rate_limited" | "service_unavailable" | "invalid_response"
  | "network_error" | "http_error" | "invalid_input" | "bootstrap_error";
export interface LookupMetadata {
  attempts?: number;
  queueTimeMs?: number;
  terminationReason?: TerminationReason;
  retryAt?: string;
}
export interface CheckSummary {
  requested: number;
  attempted: number;
  answered: number;
  unresolved: number;
  elapsedMs: number;
}
export interface DomainResult extends LookupMetadata {
  domain: string;
  tld: string;
  rdapKey?: string;
  publicSuffix?: string;
  registrableDomain?: string;
  status: DomainStatus;
  method: CheckMethod;
  responseTime: number;
  confidence?: ResultConfidence;
  reason?: string;
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

export interface DomainDetail extends LookupMetadata {
  domain: string;
  status: DomainStatus;
  method: CheckMethod;
  responseTime: number;
  rdapKey?: string;
  publicSuffix?: string;
  registrableDomain?: string;
  confidence?: ResultConfidence;
  reason?: string;
  registrar?: string;
  registrant?: string;
  createdDate?: string;
  updatedDate?: string;
  expiryDate?: string;
  nameServers?: string[];
  dnssec?: boolean;
  statusCodes?: string[];
  rawWhois?: string;
  rawRdap?: Record<string, unknown>;
  error?: string;
}

export const DEFAULT_PREFIXES = ["get", "use", "try", "my", "go", "join"] as const;
export const DEFAULT_SUFFIXES = ["app", "labs", "hq", "ly", "dev", "hub", "run", "kit"] as const;
