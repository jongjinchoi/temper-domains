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
  | "network_error" | "http_error" | "invalid_input" | "bootstrap_error"
  | "server_cooldown" | "limit_state_error";
export type RetryAtSource = "server" | "client_policy";
export interface LookupMetadata {
  attempts?: number;
  queueTimeMs?: number;
  terminationReason?: TerminationReason;
  retryAt?: string;
  retryAtSource?: RetryAtSource;
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
  "com", "net", "org", "xyz", "top", "info", "shop", "online", "store", "site",
  "vip", "sbs", "app", "biz", "pro", "bond", "lol", "click", "cfd", "dev",
  "live", "space", "asia", "icu", "ai", "io", "co", "me", "tv", "cc",
] as const;

export const EXTENDED_TLDS = [
  ...DEFAULT_TLDS,
  "club", "tech", "cyou", "cloud", "life", "world", "fun", "mobi", "blog", "digital",
  "work", "art", "link", "website", "autos", "one", "help", "buzz", "lat", "studio",
  "skin", "win", "bet", "run", "today", "makeup", "beer", "email", "ink", "design",
] as const;

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
