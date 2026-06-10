import { getServerLimit } from "./limiter.ts";
import { enrichDomainResult } from "./policy.ts";
import { rdapLookup } from "./rdap.ts";
import type { DomainResult } from "./types.ts";
import { whoisLookup } from "./whois.ts";
import { getTld } from "../utils/domain.ts";

export async function lookupDomainAvailability(
  domain: string,
  rdapUrl: string | null,
  signal: AbortSignal,
  timeoutMs: number,
  rdapKey?: string,
): Promise<DomainResult> {
  const tld = getTld(domain);

  try {
    if (rdapUrl) {
      const serverLimit = getServerLimit(rdapUrl);
      const result = await serverLimit(() => rdapLookup(domain, rdapUrl, signal));
      return enrichDomainResult(result, rdapKey);
    }
    return enrichDomainResult(await whoisLookup(domain, signal, timeoutMs), rdapKey);
  } catch (err) {
    return enrichDomainResult({
      domain,
      tld,
      status: signal.aborted ? "slow" : "error",
      method: rdapUrl ? "rdap" : "whois",
      responseTime: 0,
      error: err instanceof Error ? err.message : String(err),
    }, rdapKey);
  }
}
