import { createConnection } from "node:net";
import type { DomainDetail, DomainResult, DomainStatus } from "./types.ts";
import { getTld } from "../utils/domain.ts";

import { WHOIS_PROFILES } from "./services.ts";
import { domainToASCII } from "node:url";
import { abortReason } from "./run.ts";

function failureReason(error: unknown, signal: AbortSignal, attempts: number) {
  if (signal.aborted) return abortReason(signal, attempts);
  return error instanceof Error && error.message === "whois timeout" ? "request_timeout" as const : "network_error" as const;
}

export function hasWhoisServer(tld: string): boolean { return Object.hasOwn(WHOIS_PROFILES, tld); }

async function whoisRaw(
  host: string,
  domain: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    let data = "";
    let settled = false;
    let socket: ReturnType<typeof createConnection> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };

    const fail = (err: Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket?.destroy();
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    const onAbort = () => {
      fail(new DOMException("Aborted", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    timer = setTimeout(() => {
      fail(new Error("whois timeout"));
    }, timeoutMs);

    socket = createConnection(43, host, () => {
      socket?.write(`${domain}\r\n`);
    });

    socket.on("data", (chunk) => {
      data += chunk.toString();
    });

    socket.on("end", () => {
      succeed();
    });

    socket.on("error", (err) => {
      fail(err);
    });
  });
}

export function whoisLimitMessage(raw: string): string | undefined {
  const line = raw.split(/\r?\n/).slice(0, 5).map(line => line.trim().replace(/^[%#]+\s*/, ""))
    .find(line => /^(?:error:\s*)?(?:rate limit exceeded|quota exceeded|too many queries)\b/i.test(line));
  return line?.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim().slice(0, 240);
}

export function detectStatus(raw: string, domain?: string): DomainStatus {
  const profile = domain ? WHOIS_PROFILES[getTld(domain)]?.parser : "standard";
  const field = profile === "sn" ? /^nom de domaine:\s*(\S+)/im : profile === "cr" || profile === "sr" ? /^domain:\s*(\S+)/im : /^domain name:\s*(\S+)/im;
  const matched = field.exec(raw)?.[1];
  if (matched && domain && domainToASCII(matched).toLowerCase() !== domainToASCII(domain).toLowerCase()) return "error";
  if (whoisLimitMessage(raw)) return "rate_limited";
  const lines = raw.split(/\r?\n/).map(line => line.trim().replace(/^[%#]+\s*/, ""));
  if (lines.slice(0, 5).some(line => /^(?:error:\s*)?(?:access denied|not authorized|permission denied)\b/i.test(line))) return "error";
  // Anchor response markers; legal notices and free-form remarks are not status.
  const negative = profile === "cr" ? /^(?:ERROR:101: )?no entries found[.!]?$/i
    : profile === "sr" ? /^Message:\s*No Object Found[.!]?$/i
    : profile === "sn" ? /^NOT FOUND[.!]?$/i
    : /^(?:no match(?: for.*)?|not found[.!]?|domain not found[.!]?|no data found[.!]?|no entries found[.!]?|no object found[.!]?|status:\s*free|the queried object does not exist(?::.*)?)$/i;
  const specialStatus = lines.some(line => /^(?:this )?domain.*(?:is reserved|is a premium)|^(?:reserved|premium)(?:\s|$)|^this is a premium domain/i.test(line));
  if (lines.some(line => negative.test(line))) {
    // Existing SR and queried-object fixtures echo the queried name even when
    // absent. Their name field alone is not positive registration evidence.
    const echoedQuery = profile === "sr" || lines.some(line => /^the queried object does not exist(?::.*)?$/i.test(line));
    const registeredFields = lines.some(line => /^(?:status:\s*(?!free\b)\S|statut:\s*actif|creation date:|registered:|registrar:|name server:|nserver:)/i.test(line));
    if (specialStatus || registeredFields || (matched && !echoedQuery)) return "error";
    return "available";
  }
  if (matched) return "taken";
  if (specialStatus) return /premium/i.test(raw) ? "premium" : "reserved";
  return "error";
}

export async function whoisLookup(
  domain: string,
  signal: AbortSignal,
  timeoutMs = 3000,
): Promise<DomainResult> {
  const tld = getTld(domain);
  const host = WHOIS_PROFILES[tld]?.host;
  if (!host) {
    return {
      domain, tld, status: "error", method: "whois", responseTime: 0, attempts: 0,
      error: `No whois server for .${tld}`,
    };
  }

  const start = performance.now();
  const attempts = signal.aborted ? 0 : 1;

  try {
    const raw = await whoisRaw(host, domain, timeoutMs, signal);

    const responseTime = Math.round(performance.now() - start);
    const status = detectStatus(raw, domain);
    return { domain, tld, status, method: "whois", responseTime, attempts, ...(status === "rate_limited" ? { error: whoisLimitMessage(raw), terminationReason: "rate_limited" as const } : {}), ...(status === "error" ? { error: "WHOIS response is unrecognized or does not match the query", terminationReason: "invalid_response" as const } : {}) };
  } catch (err) {
    const responseTime = Math.round(performance.now() - start);
    if (signal.aborted) {
      return { domain, tld, status: "slow", method: "whois", responseTime, attempts, terminationReason: failureReason(err, signal, attempts) };
    }
    return {
      domain, tld, status: "error", method: "whois", responseTime, attempts,
      error: err instanceof Error ? err.message : String(err),
      terminationReason: failureReason(err, signal, attempts),
    };
  }
}

// --- Detail parsing ---

function normalizeDate(value: string): string {
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch { /* fallback */ }
  return value;
}

export function parseWhoisRaw(raw: string, profile = "standard"): Partial<DomainDetail> {
  const detail: Partial<DomainDetail> = {};
  const nameServers: string[] = [];
  const statusCodes: string[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%") || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    let key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const dialect: Record<string, string> = profile === "sn" ? { "date de création": "creation date", "dernière modification": "updated date", "date d'expiration": "expiry date", "statut": "status" } : profile === "cr" ? { expire: "expiry date" } : {};
    key = dialect[key] ?? key;
    let value = trimmed.slice(colonIdx + 1).trim();
    // CR dates have no timezone: preserve that uncertainty, avoid host-local parsing.
    if (profile === "cr" && /^(\d{2})\.(\d{2})\.(\d{4})/.test(value)) value = value.replace(/^(\d{2})\.(\d{2})\.(\d{4})(.*)$/, "$3-$2-$1$4");
    if (!value) continue;

    switch (key) {
      case "registrar":
      case "sponsoring registrar":
        if (!detail.registrar) detail.registrar = value;
        break;
      case "registrant organization":
      case "registrant name":
        if (!detail.registrant) detail.registrant = value;
        break;
      case "creation date":
      case "created":
      case "created on":
      case "registered":
        if (!detail.createdDate) detail.createdDate = profile === "cr" ? value : normalizeDate(value);
        break;
      case "updated date":
      case "last updated":
      case "last modified":
      case "changed":
        if (!detail.updatedDate) detail.updatedDate = profile === "cr" ? value : normalizeDate(value);
        break;
      case "expiry date":
      case "expiration date":
      case "registry expiry date":
      case "registrar registration expiration date":
      case "paid-till":
        if (!detail.expiryDate) detail.expiryDate = profile === "cr" ? value : normalizeDate(value);
        break;
      case "name server":
      case "nserver":
        nameServers.push(value.split(/\s/)[0]!.toLowerCase());
        break;
      case "dnssec":
        detail.dnssec = value.toLowerCase().includes("signed") &&
          !value.toLowerCase().includes("unsigned");
        break;
      case "domain status":
      case "status": {
        const code = value.split(/\s+/)[0];
        if (code) statusCodes.push(code);
        break;
      }
    }
  }

  if (nameServers.length > 0) detail.nameServers = [...new Set(nameServers)];
  if (statusCodes.length > 0) detail.statusCodes = [...new Set(statusCodes)];

  return detail;
}

export async function whoisDetail(
  domain: string,
  signal: AbortSignal,
  timeoutMs = 5000,
): Promise<DomainDetail> {
  const tld = getTld(domain);
  const host = WHOIS_PROFILES[tld]?.host;
  if (!host) {
    return {
      domain, status: "error", method: "whois", responseTime: 0, attempts: 0,
      error: `No whois server for .${tld}`,
    };
  }

  const start = performance.now();
  const attempts = signal.aborted ? 0 : 1;

  try {
    const raw = await whoisRaw(host, domain, timeoutMs, signal);

    const responseTime = Math.round(performance.now() - start);
    const status = detectStatus(raw, domain);
    const parsed = status === "taken" ? parseWhoisRaw(raw, WHOIS_PROFILES[tld]?.parser) : {};

    return {
      domain, status, method: "whois", responseTime, attempts,
      ...parsed,
      ...(status === "rate_limited" ? { error: whoisLimitMessage(raw), terminationReason: "rate_limited" as const } : {}), ...(status === "error" ? { error: "WHOIS response is unrecognized or does not match the query", terminationReason: "invalid_response" as const } : {}),
      rawWhois: raw,
    };
  } catch (err) {
    const responseTime = Math.round(performance.now() - start);
    return {
      domain,
      status: signal.aborted ? "slow" : "error",
      method: "whois",
      responseTime,
      attempts,
      error: err instanceof Error ? err.message : String(err),
      terminationReason: failureReason(err, signal, attempts),
    };
  }
}
