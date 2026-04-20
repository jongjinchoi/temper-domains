import { createConnection } from "node:net";
import type { DomainDetail, DomainResult, DomainStatus } from "./types.ts";
import { getTld } from "../utils/domain.ts";

const WHOIS_SERVERS: Record<string, string> = {
  io: "whois.nic.io",
  co: "whois.registry.co",
  me: "whois.nic.me",
  gg: "whois.gg",
  sh: "whois.nic.sh",
  so: "whois.nic.so",
};

async function whoisRaw(
  host: string,
  domain: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("whois timeout"));
    }, timeoutMs);

    const socket = createConnection(43, host, () => {
      socket.write(`${domain}\r\n`);
    });

    socket.on("data", (chunk) => {
      data += chunk.toString();
    });

    socket.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function detectStatus(raw: string): DomainStatus {
  const lower = raw.toLowerCase();
  const hasDomainName = /^domain name:/im.test(raw);

  // Available patterns (check BEFORE Domain Name header — some registries like .so
  // return "Domain Name:" even for non-existent domains with "does not exist")
  const availablePatterns = [
    "no match",
    "not found",
    "domain not found",
    "no data found",
    "no entries found",
    "does not exist",
    "no object found",
    "status: free",
  ];
  if (availablePatterns.some((p) => lower.includes(p))) {
    return "available";
  }

  // Taken (Domain Name header without any "not found" pattern)
  if (hasDomainName) {
    return "taken";
  }

  // Rate limit — only match first few lines (actual rejection responses are short)
  const firstLines = lower.split("\n").slice(0, 5).join(" ");
  if (
    firstLines.includes("rate limit") ||
    firstLines.includes("quota exceeded") ||
    firstLines.includes("too many queries")
  ) {
    return "rate_limited";
  }

  // Reserved
  if (lower.includes("reserved") || lower.includes("is reserved")) {
    return "reserved";
  }

  // Premium
  if (lower.includes("premium")) {
    return "premium";
  }

  return "error";
}

export async function whoisLookup(
  domain: string,
  signal: AbortSignal,
  timeoutMs = 3000,
): Promise<DomainResult> {
  const tld = getTld(domain);
  const host = WHOIS_SERVERS[tld];
  if (!host) {
    return {
      domain, tld, status: "error", method: "whois", responseTime: 0,
      error: `No whois server for .${tld}`,
    };
  }

  const start = performance.now();

  try {
    const raw = await Promise.race([
      whoisRaw(host, domain, timeoutMs),
      new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    ]);

    const responseTime = Math.round(performance.now() - start);
    const status = detectStatus(raw);
    return { domain, tld, status, method: "whois", responseTime };
  } catch (err) {
    const responseTime = Math.round(performance.now() - start);
    if (signal.aborted) {
      return { domain, tld, status: "slow", method: "whois", responseTime };
    }
    return {
      domain, tld, status: "error", method: "whois", responseTime,
      error: err instanceof Error ? err.message : String(err),
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

export function parseWhoisRaw(raw: string): Partial<DomainDetail> {
  const detail: Partial<DomainDetail> = {};
  const nameServers: string[] = [];
  const statusCodes: string[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%") || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const value = trimmed.slice(colonIdx + 1).trim();
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
        if (!detail.createdDate) detail.createdDate = normalizeDate(value);
        break;
      case "updated date":
      case "last updated":
      case "last modified":
        if (!detail.updatedDate) detail.updatedDate = normalizeDate(value);
        break;
      case "expiry date":
      case "expiration date":
      case "registry expiry date":
      case "registrar registration expiration date":
      case "paid-till":
        if (!detail.expiryDate) detail.expiryDate = normalizeDate(value);
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
  const host = WHOIS_SERVERS[tld];
  if (!host) {
    return {
      domain, status: "error", method: "whois", responseTime: 0,
      error: `No whois server for .${tld}`,
    };
  }

  const start = performance.now();

  try {
    const raw = await Promise.race([
      whoisRaw(host, domain, timeoutMs),
      new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    ]);

    const responseTime = Math.round(performance.now() - start);
    const status = detectStatus(raw);
    const parsed = status === "taken" ? parseWhoisRaw(raw) : {};

    return {
      domain, status, method: "whois", responseTime,
      ...parsed,
      rawWhois: raw,
    };
  } catch (err) {
    const responseTime = Math.round(performance.now() - start);
    return {
      domain,
      status: signal.aborted ? "slow" : "error",
      method: "whois",
      responseTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
