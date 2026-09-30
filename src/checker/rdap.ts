import { ServerCooldown, LimitStateError } from "./limits.ts";
import { formatStorageError } from "../utils/storage-error.ts";
import { rdapTransport, TransportError } from "./http-transport.ts";
import type { DomainDetail, DomainResult, TerminationReason } from "./types.ts";
import { serverKey } from "./scheduler.ts";
import { withAdmission, stopLimitedServer } from "./admission.ts";
import { createRun, abortReason, LookupAbort, type LookupContext } from "./run.ts";
import { getTld, parseDomain } from "../utils/domain.ts";

const RDAP_HEADERS = {
  Accept: "application/rdap+json, application/json",
  "User-Agent": "temper-domains",
};

export function retryAfterDelay(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Math.min(Number(value) * 1000, 8.64e15 - now);
  // A signed number is not an HTTP-date or a delay-seconds value.
  if (/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
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

// Returns the next URL, or the reason the redirect is rejected.
function redirectTarget(location: string | null, from: string, redirects: number): URL | string {
  if (!location || redirects > 5) return "Invalid or excessive RDAP redirects";
  let target: URL;
  try { target = new URL(location, from); }
  catch { return "Invalid or excessive RDAP redirects"; }
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password || (from.startsWith("https:") && target.protocol !== "https:")) return "Unsafe RDAP redirect";
  return target;
}

interface RdapAnswer { redirect?: string; redirectError?: string; status: number; json?: Record<string, unknown>; parsed?: Partial<DomainDetail>; retryAt?: number; retryAtSource?: "server" | "client_policy" }
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
  let httpStatus: number | undefined;
  const row = (fields: Partial<DomainDetail>): DomainDetail => ({
    domain, status: "error", method: "rdap", responseTime: Math.round(performance.now() - start),
    attempts, queueTimeMs: Math.round(queueTimeMs), httpStatus, ...fields,
  });
  // Only a 429/503 answer is kept in lastAnswer past its own return.
  const limitedRow = (): DomainDetail => row({ status: lastAnswer?.status === 429 ? "rate_limited" : "error",
    error: `HTTP ${lastAnswer?.status}`, terminationReason: lastAnswer?.status === 429 ? "rate_limited" : "service_unavailable",
    retryAt: lastAnswer?.retryAt === undefined ? undefined : new Date(lastAnswer.retryAt).toISOString(), retryAtSource: lastAnswer?.retryAtSource });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      key = serverKey(url);
      queuedAt = performance.now();
      let answer: RdapAnswer;
      try {
        answer = await withAdmission(key, ctx, signal, async (permit): Promise<RdapAnswer> => {
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
          httpStatus = response.status;
          if (response.status === 429 || response.status === 503) {
            const kind = response.status === 429 ? "rate_limited" : "service_unavailable";
            const metadata = await permit.limited(kind, retryAfterDelay(response.headers.get("retry-after")));
            stopLimitedServer(ctx, key, kind, metadata);
            return { status: response.status, retryAt: Date.parse(metadata.retryAt), retryAtSource: metadata.retryAtSource };
          }
          if (response.status === 404) await permit.answered();
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            // Decided while the permit is held: an accepted redirect is a valid
            // answer from this server; a rejected one is not.
            const target = redirectTarget(response.headers.get("location"), url, ++redirects);
            if (typeof target === "string") return { status: response.status, redirectError: target };
            await permit.answered();
            return { status: response.status, redirect: target.href };
          }
          if (response.status !== 200) return { status: response.status };
          try {
            const json = validateDomainResponse(await response.json(), domain);
            const parsed = parseRdapResponse(json);
            await permit.answered();
            return { status: 200, json, parsed };
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
      });
      } catch (error) {
        if (error instanceof ServerCooldown && !ctx.stoppedServers && error.until < ctx.deadline && !signal.aborted) { attempt--; continue; }
        // Only an unanswered transport request may use another published HTTPS URL.
        if (!signal.aborted && terminationReason === undefined && error instanceof TransportError && ["network", "tls", "protocol"].includes(error.kind) && endpoints[endpointIndex + 1]?.startsWith("https:")) {
          url = `${endpoints[++endpointIndex]!.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`;
          attempt--; continue;
        }
        throw error;
      }
      if (answer.redirectError) {
        // The server answered, but not with a usable response: repeating the request cannot help.
        terminationReason = "invalid_response";
        throw new TransportError("protocol", answer.redirectError);
      }
      if (answer.redirect) { url = answer.redirect; attempt--; continue; }
      lastAnswer = answer;
      if (answer.status === 200) return row({ status: "taken", ...answer.parsed, rawRdap: answer.json, checkedAt: new Date().toISOString() });
      if (answer.status === 404) return row({ status: "available", checkedAt: new Date().toISOString() });
      if (answer.status !== 429 && answer.status !== 503) return row({ error: answer.status === 403 ? "HTTP 403: registry denied access" : `HTTP ${answer.status}`, terminationReason: "http_error" });
      if (ctx.stoppedServers || attempt === 1 || (answer.retryAt ?? 0) >= ctx.deadline) break;
      // The next admission also waits for request spacing, not only the server's
      // wait. Best-effort estimate: admission itself reports storage failures.
      const wait = await ctx.limits.estimateWait([key], signal).catch(() => 0);
      if (Date.now() + wait >= ctx.deadline) break;
    }
    return limitedRow();
  } catch (error) {
    if (queuedAt !== undefined) queueTimeMs += performance.now() - queuedAt;
    if (error instanceof ServerCooldown) return row({ status: error.kind === "rate_limited" ? "rate_limited" : "error", terminationReason: "server_cooldown",
      retryAt: new Date(error.until).toISOString(), retryAtSource: error.source, error: formatStorageError(error) });
    if (error instanceof LimitStateError) return row({ status: "error", terminationReason: "limit_state_error", error: formatStorageError(error) });
    const reason = terminationReason ?? (signal.aborted ? abortReason(signal, attempts)
      : error instanceof LookupAbort ? error.reason : error instanceof TransportError && error.kind === "payload" ? "invalid_response" : error instanceof DOMException && error.name === "TimeoutError" ? "deadline_before_start" : "network_error");
    // A retry that ran out of time must not discard the limited answer already received.
    if (lastAnswer && (reason === "deadline" || reason === "deadline_before_start")) return limitedRow();
    return row({ status: ["deadline", "deadline_before_start", "request_timeout", "cancelled"].includes(reason) ? "slow" : "error",
      terminationReason: reason, error: error instanceof TransportError ? `${error.kind}: ${error.message}` : formatStorageError(error) });
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
