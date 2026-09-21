import { rdapTransport, TransportError } from "./http-transport.ts";
import type { DomainDetail, DomainResult, TerminationReason } from "./types.ts";
import { requestScheduler, serverKey } from "./scheduler.ts";
import { createRun, abortReason, LookupAbort, type LookupContext } from "./run.ts";
import { getTld, parseDomain } from "../utils/domain.ts";

const RDAP_HEADERS = {
  Accept: "application/rdap+json, application/json",
  "User-Agent": "temper-domains",
};

export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 500;
  if (/^\d+$/.test(value.trim())) return Math.min(Number(value) * 1000, 8.64e15 - now);
  // A signed number is not an HTTP-date or a delay-seconds value.
  if (/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return 500;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 500;
}

function validateDomainResponse(value: unknown, domain: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid RDAP domain object");
  const data = value as Record<string, unknown>;
  if (data.objectClassName !== "domain" || "errorCode" in data) throw new Error("Invalid RDAP domain object");
  for (const field of ["ldhName", "unicodeName"]) {
    if (data[field] === undefined) continue;
    if (typeof data[field] !== "string" || !parseDomain(data[field]).asciiDomain ||
      parseDomain(data[field]).asciiDomain !== parseDomain(domain).asciiDomain) {
      throw new Error("RDAP response domain does not match the query");
    }
  }
  return data;
}

interface RdapAnswer { location?: string | null; status: number; json?: Record<string, unknown>; parsed?: Partial<DomainDetail>; retryAt?: number }
async function queryRdap(domain: string, base: string | readonly string[], signal: AbortSignal, context?: LookupContext): Promise<DomainDetail> {
  if (!context) {
    const run = createRun(10000, signal);
    try { return await queryRdap(domain, base, run.signal, run.context); }
    finally { run.close(); }
  }
  const start = performance.now();
  const ctx = context;
  const endpoints = typeof base === "string" ? [base] : base;
  let endpointIndex = 0;
  let url = `${endpoints[0]!.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`;
  let key = serverKey(url);
  let redirects = 0;
  let attempts = 0;
  let queueTimeMs = 0;
  let queuedAt: number | undefined;
  let terminationReason: TerminationReason | undefined;
  let lastAnswer: RdapAnswer | undefined;
  const row = (fields: Partial<DomainDetail>): DomainDetail => ({
    domain, status: "error", method: "rdap", responseTime: Math.round(performance.now() - start),
    attempts, queueTimeMs: Math.round(queueTimeMs), ...fields,
  });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      key = serverKey(url);
      queuedAt = performance.now();
      let answer: RdapAnswer;
      try { answer = await requestScheduler.run(key, ctx.scope, async (): Promise<RdapAnswer> => {
        queueTimeMs += performance.now() - queuedAt!;
        queuedAt = undefined;
        signal.throwIfAborted();
        if (Date.now() >= ctx.deadline) throw new LookupAbort(attempts ? "deadline" : "deadline_before_start");
        attempts++;
        const controller = new AbortController();
        const remaining = ctx.deadline - Date.now();
        const timeout = setTimeout(() => controller.abort(new LookupAbort(
          remaining <= ctx.requestTimeoutMs ? "deadline" : "request_timeout",
        )), Math.max(0, Math.min(ctx.requestTimeoutMs, remaining)));
        const requestSignal = AbortSignal.any([signal, controller.signal]);
        let response: Response | undefined;
        try {
          response = await rdapTransport.request(url, { signal: requestSignal, headers: RDAP_HEADERS });
          if (response.status === 429 || response.status === 503) {
            const wait = parseRetryAfter(response.headers.get("retry-after"));
            requestScheduler.backoff(key, wait);
            return { status: response.status, retryAt: Date.now() + wait };
          }
          if (response.status !== 200) return { status: response.status, location: response.headers.get("location") };
          try {
            const json = validateDomainResponse(await response.json(), domain);
            return { status: 200, json, parsed: parseRdapResponse(json) };
          } catch (error) {
            if (!requestSignal.aborted) terminationReason = "invalid_response";
            throw error;
          }
        } catch (error) {
          if (requestSignal.aborted) terminationReason = abortReason(requestSignal, attempts);
          throw error;
        } finally {
          clearTimeout(timeout);
          await response?.body?.cancel().catch(() => {});
        }
      }, signal);
      } catch (error) {
        // Only an unanswered transport request may use another published HTTPS URL.
        if (!signal.aborted && terminationReason === undefined && error instanceof TransportError && ["network", "tls", "protocol"].includes(error.kind) && endpoints[endpointIndex + 1]?.startsWith("https:")) {
          url = `${endpoints[++endpointIndex]!.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`;
          attempt--; continue;
        }
        throw error;
      }
      if ([301, 302, 303, 307, 308].includes(answer.status)) {
        if (!answer.location || ++redirects > 5) throw new TransportError("protocol", "Invalid or excessive RDAP redirects");
        const target = new URL(answer.location, url);
        if (!["https:", "http:"].includes(target.protocol) || target.username || target.password || (url.startsWith("https:") && target.protocol !== "https:")) throw new TransportError("protocol", "Unsafe RDAP redirect");
        url = target.href; attempt--; continue;
      }
      lastAnswer = answer;
      if (answer.status === 200) return row({ status: "taken", ...answer.parsed, rawRdap: answer.json });
      if (answer.status === 404) return row({ status: "available" });
      if (answer.status !== 429 && answer.status !== 503) return row({ error: answer.status === 403 ? "HTTP 403: registry denied access" : `HTTP ${answer.status}`, terminationReason: "http_error" });
      if (attempt === 1 || (answer.retryAt ?? 0) >= ctx.deadline) break;
    }
    return row({ status: lastAnswer?.status === 429 ? "rate_limited" : "error",
      error: `HTTP ${lastAnswer?.status}`, terminationReason: lastAnswer?.status === 429 ? "rate_limited" : "service_unavailable",
      retryAt: lastAnswer?.retryAt === undefined ? undefined : new Date(lastAnswer.retryAt).toISOString() });
  } catch (error) {
    if (queuedAt !== undefined) queueTimeMs += performance.now() - queuedAt;
    const reason = terminationReason ?? (signal.aborted ? abortReason(signal, attempts)
      : error instanceof LookupAbort ? error.reason : error instanceof TransportError && error.kind === "payload" ? "invalid_response" : "network_error");
    return row({ status: ["deadline", "deadline_before_start", "request_timeout", "cancelled"].includes(reason) ? "slow" : "error",
      terminationReason: reason, error: error instanceof TransportError ? `${error.kind}: ${error.message}` : error instanceof Error ? error.message : String(error) });
  }
}

export async function rdapLookup(domain: string, base: string | readonly string[], signal: AbortSignal, context?: LookupContext): Promise<DomainResult> {
  const { rawRdap, registrar, registrant, createdDate, updatedDate, expiryDate, nameServers, dnssec, statusCodes, ...result } =
    await queryRdap(domain, base, signal, context);
  return { ...result, tld: getTld(domain) };
}
export async function rdapDetail(domain: string, base: string | readonly string[], signal: AbortSignal, context?: LookupContext): Promise<DomainDetail> {
  return queryRdap(domain, base, signal, context);
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
