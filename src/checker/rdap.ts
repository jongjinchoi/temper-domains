import type { DomainResult } from "./types";

export async function rdapLookup(
  domain: string,
  rdapBaseUrl: string,
  signal: AbortSignal,
): Promise<DomainResult> {
  const tld = domain.split(".").pop()!;
  const url = `${rdapBaseUrl.replace(/\/$/, "")}/domain/${domain}`;
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
