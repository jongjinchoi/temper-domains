import type { DomainDetail, DomainResult } from "./types.ts";
import { getTld } from "../utils/domain.ts";

export async function rdapLookup(
  domain: string,
  rdapBaseUrl: string,
  signal: AbortSignal,
): Promise<DomainResult> {
  const tld = getTld(domain);
  const url = `${rdapBaseUrl.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`;
  const start = performance.now();

  try {
    const res = await fetch(url, { signal, redirect: "follow" });
    const responseTime = Math.round(performance.now() - start);

    if (res.status === 404) {
      return { domain, tld, status: "available", method: "rdap", responseTime };
    }
    if (res.status === 200) {
      return { domain, tld, status: "taken", method: "rdap", responseTime };
    }
    if (res.status === 429 || res.status === 503) {
      return { domain, tld, status: "rate_limited", method: "rdap", responseTime };
    }

    return {
      domain, tld, status: "error", method: "rdap", responseTime,
      error: `Unexpected HTTP ${res.status}`,
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
    const res = await fetch(url, { signal, redirect: "follow" });
    const responseTime = Math.round(performance.now() - start);

    if (res.status === 404) {
      return { domain, status: "available", method: "rdap", responseTime };
    }
    if (res.status === 429 || res.status === 503) {
      return { domain, status: "rate_limited", method: "rdap", responseTime };
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
