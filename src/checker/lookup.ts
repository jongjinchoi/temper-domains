import { requestScheduler, createRequestScope } from "./scheduler.ts";
import { abortReason, type LookupContext } from "./run.ts";
import { enrichDomainResult } from "./policy.ts";
import { rdapLookup } from "./rdap.ts";
import type { DomainResult } from "./types.ts";
import { whoisLookup } from "./whois.ts";
import { getTld } from "../utils/domain.ts";

export async function lookupDomainAvailability(domain: string, rdapUrl: string | null, signal: AbortSignal,
  timeoutMs: number, rdapKey?: string, context?: LookupContext, endpoints?: readonly string[]): Promise<DomainResult> {
  if (rdapUrl) return enrichDomainResult(await rdapLookup(domain, endpoints ?? rdapUrl, signal, context), rdapKey);
  const queuedAt = performance.now();
  let attempts = 0;
  let queueTimeMs = 0;
  try {
    const result = await requestScheduler.run(`whois:${getTld(domain)}`, context?.scope ?? createRequestScope(), async () => {
      signal.throwIfAborted();
      attempts++;
      queueTimeMs = performance.now() - queuedAt;
      return whoisLookup(domain, signal, Math.min(timeoutMs, context?.requestTimeoutMs ?? 5000));
    }, signal);
    attempts = result.attempts ?? attempts;
    return enrichDomainResult({ ...result, attempts, queueTimeMs: Math.round(queueTimeMs),
      terminationReason: signal.aborted ? abortReason(signal, attempts) : result.status === "slow" || result.error === "whois timeout" ? "request_timeout" : result.terminationReason }, rdapKey);
  } catch (error) {
    return enrichDomainResult({ domain, tld: getTld(domain), status: signal.aborted ? "slow" : "error", method: "whois",
      responseTime: Math.round(performance.now() - queuedAt), attempts, queueTimeMs: Math.round(attempts ? queueTimeMs : performance.now() - queuedAt),
      terminationReason: signal.aborted ? abortReason(signal, attempts) : "network_error",
      error: error instanceof Error ? error.message : String(error) }, rdapKey);
  }
}
