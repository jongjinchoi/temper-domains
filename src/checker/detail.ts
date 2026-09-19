import { getBootstrap } from "./bootstrap.ts";
import { createRun, waitWithSignal, abortReason } from "./run.ts";
import { requestScheduler } from "./scheduler.ts";
import { enrichDomainDetail, getDomainInputError } from "./policy.ts";
import { rdapDetail } from "./rdap.ts";
import type { DomainDetail } from "./types.ts";
import { findRdapBootstrapKey, getTld } from "../utils/domain.ts";
import { sanitizeDomain } from "../utils/validate.ts";
import { whoisDetail } from "./whois.ts";

export async function domainDetail(domain: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<DomainDetail> {
  domain = sanitizeDomain(domain).toLowerCase();
  const run = createRun(options.timeoutMs ?? 10000, options.signal);
  let attempts = 0;
  let method: "rdap" | "whois" = "rdap";
  try {
    const inputError = getDomainInputError(domain);
    if (inputError) return { domain, status: "error", method, responseTime: 0, attempts: 0, terminationReason: "invalid_input", error: inputError };
    run.signal.throwIfAborted();
    const map = await waitWithSignal(getBootstrap(), run.signal);
    const key = findRdapBootstrapKey(domain, key => map.has(key));
    const url = map.get(key);
    if (url) return enrichDomainDetail(await rdapDetail(domain, url, run.signal, run.context), key);
    method = "whois";
    const detail = await requestScheduler.run(`whois:${getTld(domain)}`, run.context.scope, async () => {
      run.signal.throwIfAborted();
      attempts++;
      return whoisDetail(domain, run.signal, run.context.requestTimeoutMs);
    }, run.signal);
    return enrichDomainDetail({ ...detail, attempts: detail.attempts ?? attempts,
      terminationReason: run.signal.aborted ? abortReason(run.signal, attempts) : detail.status === "slow" || detail.error === "whois timeout" ? "request_timeout" : undefined }, key);
  } catch (error) {
    return enrichDomainDetail({ domain, method, status: run.signal.aborted ? "slow" : "error", attempts,
      responseTime: Math.round(performance.now() - run.startedAt),
      terminationReason: run.signal.aborted ? abortReason(run.signal, attempts) : "bootstrap_error",
      error: error instanceof Error ? error.message : String(error) });
  } finally { run.close(); }
}
