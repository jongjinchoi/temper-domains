import { ServerCooldown, LimitStateError } from "./limits.ts";
import { runWhoisRequest } from "./whois-request.ts";
import { createRun } from "./run.ts";
import { abortReason, type LookupContext } from "./run.ts";
import { enrichDomainResult } from "./policy.ts";
import { rdapLookup } from "./rdap.ts";
import type { DomainResult } from "./types.ts";
import { whoisLookup } from "./whois.ts";
import { getTld } from "../utils/domain.ts";

export async function lookupDomainAvailability(domain: string, rdapUrl: string | null, signal: AbortSignal,
  timeoutMs: number, rdapKey?: string, context?: LookupContext, endpoints?: readonly string[]): Promise<DomainResult> {
  if (!context) {
    const run = createRun(timeoutMs, signal);
    try { return await lookupDomainAvailability(domain, rdapUrl, run.signal, timeoutMs, rdapKey, run.context, endpoints); }
    finally { run.close(); }
  }
  if (rdapUrl) return enrichDomainResult(await rdapLookup(domain, endpoints ?? rdapUrl, signal, context), rdapKey);
  const queuedAt = performance.now();
  let attempts = 0;
  let queueTimeMs = 0;
  try {
    const result = await runWhoisRequest(domain, signal, context!, async () => {
      signal.throwIfAborted();
      attempts++;
      queueTimeMs = performance.now() - queuedAt;
      return whoisLookup(domain, signal, Math.min(timeoutMs, context?.requestTimeoutMs ?? 5000));
    });
    attempts = result.attempts ?? attempts;
    return enrichDomainResult({ ...result, attempts, queueTimeMs: Math.round(queueTimeMs),
      terminationReason: signal.aborted ? abortReason(signal, attempts) : result.status === "slow" || result.error === "whois timeout" ? "request_timeout" : result.terminationReason }, rdapKey);
  } catch (error) {
    if (error instanceof ServerCooldown) return enrichDomainResult({ domain, tld: getTld(domain), status: error.kind === "rate_limited" ? "rate_limited" : "error", method: "whois", responseTime: Math.round(performance.now() - queuedAt), attempts,
      terminationReason: "server_cooldown", retryAt: new Date(error.until).toISOString(), retryAtSource: error.source, error: error.message }, rdapKey);
    return enrichDomainResult({ domain, tld: getTld(domain), status: signal.aborted ? "slow" : "error", method: "whois",
      responseTime: Math.round(performance.now() - queuedAt), attempts, queueTimeMs: Math.round(attempts ? queueTimeMs : performance.now() - queuedAt),
      terminationReason: signal.aborted ? abortReason(signal, attempts) : error instanceof LimitStateError ? "limit_state_error" : error instanceof DOMException && error.name === "TimeoutError" ? "deadline_before_start" : "network_error",
      error: error instanceof Error ? error.message : String(error) }, rdapKey);
  }
}
