import { getServerLimit } from "./limiter.ts";
import { rdapLookup } from "./rdap.ts";
import type { DomainResult } from "./types.ts";
import { whoisLookup } from "./whois.ts";
import { getTld } from "../utils/domain.ts";

export async function lookupDomainAvailability(
  domain: string,
  rdapUrl: string | null,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<DomainResult> {
  const tld = getTld(domain);

  try {
    if (rdapUrl) {
      const serverLimit = getServerLimit(rdapUrl);
      return await serverLimit(() => rdapLookup(domain, rdapUrl, signal));
    }
    return await whoisLookup(domain, signal, timeoutMs);
  } catch (err) {
    return {
      domain,
      tld,
      status: signal.aborted ? "slow" : "error",
      method: rdapUrl ? "rdap" : "whois",
      responseTime: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
