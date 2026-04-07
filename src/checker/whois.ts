import { createConnection } from "node:net";
import type { DomainResult, DomainStatus } from "./types.ts";
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
      whoisRaw(host, domain, 3000),
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
