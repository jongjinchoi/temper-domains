import type { DomainResult, DomainStatus } from "./types";

const WHOIS_SERVERS: Record<string, string> = {
  io: "whois.nic.io",
  co: "whois.registry.co",
  me: "whois.nic.me",
};

async function whoisRaw(
  host: string,
  domain: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => {
      reject(new Error("whois timeout"));
    }, timeoutMs);

    Bun.connect({
      hostname: host,
      port: 43,
      socket: {
        open(socket) {
          socket.write(`${domain}\r\n`);
        },
        data(_socket, chunk) {
          data += Buffer.from(chunk).toString();
        },
        close() {
          clearTimeout(timer);
          resolve(data);
        },
        error(_socket, err) {
          clearTimeout(timer);
          reject(err);
        },
        connectError(_socket, err) {
          clearTimeout(timer);
          reject(err);
        },
      },
    });
  });
}

export function detectStatus(raw: string): DomainStatus {
  const lower = raw.toLowerCase();
  const hasDomainName = /^domain name:/im.test(raw);

  // Taken (highest confidence signal)
  if (hasDomainName) {
    return "taken";
  }

  // Available patterns (check before rate_limit to avoid Terms of Use false positives)
  const availablePatterns = [
    "no match",
    "not found",
    "domain not found",
    "no data found",
    "no entries found",
    "status: free",
  ];
  if (availablePatterns.some((p) => lower.includes(p))) {
    return "available";
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
  const tld = domain.split(".").pop()!;
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
