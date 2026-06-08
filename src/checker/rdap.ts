import type { DomainDetail, DomainResult } from "./types.ts";
import { applyServerBackoff } from "./limiter.ts";
import { getTld } from "../utils/domain.ts";

const RDAP_HEADERS = {
  Accept: "application/rdap+json, application/json",
  "User-Agent": "temper-domains",
};
const MAX_ACTIVE_RETRY_AFTER_MS = 1000;
const MAX_SERVER_BACKOFF_MS = 30_000;
const FALLBACK_RETRY_MS = 500;

function parseRetryAfter(value: string | null, maxMs: number): number {
  if (!value) return FALLBACK_RETRY_MS;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1000, 0), maxMs);
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return FALLBACK_RETRY_MS;

  return Math.min(Math.max(dateMs - Date.now(), 0), maxMs);
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function fetchRdap(url: string, rdapBaseUrl: string, signal: AbortSignal): Promise<Response> {
  let res = await fetch(url, { signal, redirect: "follow", headers: RDAP_HEADERS });
  if (res.status !== 429 && res.status !== 503) return res;

  const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), MAX_SERVER_BACKOFF_MS);
  applyServerBackoff(rdapBaseUrl, retryAfterMs);
  await delay(Math.min(retryAfterMs, MAX_ACTIVE_RETRY_AFTER_MS), signal);
  res = await fetch(url, { signal, redirect: "follow", headers: RDAP_HEADERS });
  if (res.status === 429 || res.status === 503) {
    applyServerBackoff(rdapBaseUrl, parseRetryAfter(res.headers.get("retry-after"), MAX_SERVER_BACKOFF_MS));
  }
  return res;
}

export async function rdapLookup(
  domain: string,
  rdapBaseUrl: string,
  signal: AbortSignal,
): Promise<DomainResult> {
  const tld = getTld(domain);
  const url = `${rdapBaseUrl.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`;
  const start = performance.now();

  try {
    const res = await fetchRdap(url, rdapBaseUrl, signal);
    const responseTime = Math.round(performance.now() - start);

    if (res.status === 404) {
      return { domain, tld, status: "available", method: "rdap", responseTime };
    }
    if (res.status === 200) {
      return { domain, tld, status: "taken", method: "rdap", responseTime };
    }
    if (res.status === 429 || res.status === 503) {
      return { domain, tld, status: "rate_limited", method: "rdap", responseTime, error: `HTTP ${res.status}` };
    }

    return {
      domain, tld, status: "error", method: "rdap", responseTime,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    const responseTime = Math.round(performance.now() - start);
    if (signal.aborted) {
      return { domain, tld, status: "slow", method: "rdap", responseTime };
    }
    return {
      domain, tld, status: "error", method: "rdap", responseTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Detail parsing (RFC 9083) ---

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, Record<string, unknown>, string, string | string[]]>];
  publicIds?: Array<{ type: string; identifier: string }>;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

interface RdapNameserver {
  ldhName?: string;
}

interface RdapResponse {
  status?: string[];
  entities?: RdapEntity[];
  events?: RdapEvent[];
  nameservers?: RdapNameserver[];
  secureDNS?: { delegationSigned?: boolean };
  [key: string]: unknown;
}

function extractVcardFn(entity: RdapEntity): string | undefined {
  const vcard = entity.vcardArray?.[1];
  if (!vcard) return undefined;
  const fnEntry = vcard.find(entry => entry[0] === "fn");
  if (fnEntry) {
    const val = fnEntry[3];
    return typeof val === "string" ? val : undefined;
  }
  return undefined;
}

export function parseRdapResponse(data: Record<string, unknown>): Partial<DomainDetail> {
  const json = data as RdapResponse;
  const detail: Partial<DomainDetail> = {};

  // Registrar
  const registrarEntity = json.entities?.find(e => e.roles?.includes("registrar"));
  if (registrarEntity) {
    detail.registrar = extractVcardFn(registrarEntity) ??
      registrarEntity.publicIds?.[0]?.identifier;
  }

  // Registrant
  const registrantEntity = json.entities?.find(e => e.roles?.includes("registrant"));
  if (registrantEntity) {
    detail.registrant = extractVcardFn(registrantEntity);
  }

  // Events → dates
  if (json.events) {
    for (const event of json.events) {
      switch (event.eventAction) {
        case "registration":
          if (!detail.createdDate) detail.createdDate = event.eventDate;
          break;
        case "last changed":
          if (!detail.updatedDate) detail.updatedDate = event.eventDate;
          break;
        case "expiration":
          if (!detail.expiryDate) detail.expiryDate = event.eventDate;
          break;
      }
    }
  }

  // Nameservers
  if (json.nameservers?.length) {
    detail.nameServers = json.nameservers
      .map(ns => ns.ldhName?.toLowerCase())
      .filter((s): s is string => !!s);
  }

  // DNSSEC
  if (json.secureDNS) {
    detail.dnssec = json.secureDNS.delegationSigned ?? false;
  }

  // Status codes
  if (json.status?.length) {
    detail.statusCodes = json.status;
  }

  return detail;
}

export async function rdapDetail(
  domain: string,
  rdapBaseUrl: string,
  signal: AbortSignal,
): Promise<DomainDetail> {
  const tld = getTld(domain);
  const url = `${rdapBaseUrl.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`;
  const start = performance.now();

  try {
    const res = await fetchRdap(url, rdapBaseUrl, signal);
    const responseTime = Math.round(performance.now() - start);

    if (res.status === 404) {
      return { domain, status: "available", method: "rdap", responseTime };
    }
    if (res.status === 429 || res.status === 503) {
      return { domain, status: "rate_limited", method: "rdap", responseTime, error: `HTTP ${res.status}` };
    }
    if (res.status !== 200) {
      return { domain, status: "error", method: "rdap", responseTime, error: `HTTP ${res.status}` };
    }

    const json = await res.json() as Record<string, unknown>;
    const parsed = parseRdapResponse(json);

    return {
      domain, status: "taken", method: "rdap", responseTime,
      ...parsed,
      rawRdap: json,
    };
  } catch (err) {
    const responseTime = Math.round(performance.now() - start);
    return {
      domain,
      status: signal.aborted ? "slow" : "error",
      method: "rdap",
      responseTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
