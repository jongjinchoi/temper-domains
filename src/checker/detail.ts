import { localLimits } from "./limit-store.ts";
import { ServerCooldown, LimitStateError, type LimitCoordinator } from "./limits.ts";
import { runWhoisRequest } from "./whois-request.ts";
import { lookupPlan } from "./services.ts";
import { getBootstrap } from "./bootstrap.ts";
import { createRun, waitWithSignal, abortReason } from "./run.ts";
import { enrichDomainDetail, getDomainInputError } from "./policy.ts";
import { rdapDetail } from "./rdap.ts";
import type { DomainDetail } from "./types.ts";
import { sanitizeDomain } from "../utils/validate.ts";
import { whoisDetail } from "./whois.ts";

export async function domainDetail(domain: string, options: { timeoutMs?: number; signal?: AbortSignal; limits?: LimitCoordinator } = {}): Promise<DomainDetail> {
  domain = sanitizeDomain(domain).toLowerCase();
  const run = createRun(options.timeoutMs ?? 10000, options.signal, 20, 5000, options.limits ?? localLimits);
  let attempts = 0;
  let method: "rdap" | "whois" = "rdap";
  try {
    const inputError = getDomainInputError(domain);
    if (inputError) return { domain, status: "error", method, responseTime: 0, attempts: 0, terminationReason: "invalid_input", error: inputError };
    run.signal.throwIfAborted();
    const map = await waitWithSignal(getBootstrap(), run.signal);
    const plan = lookupPlan(domain, map);
    const key = plan.key;
    if (plan.method === "rdap") return enrichDomainDetail(await rdapDetail(domain, plan.endpoints, run.signal, run.context), key);
    method = "whois";
    const detail = await runWhoisRequest(domain, run.signal, run.context, () => {
      attempts++;
      return whoisDetail(domain, run.signal, run.context.requestTimeoutMs);
    });
    return enrichDomainDetail({ ...detail, attempts: detail.attempts ?? attempts,
      terminationReason: run.signal.aborted ? abortReason(run.signal, attempts) : detail.status === "slow" || detail.error === "whois timeout" ? "request_timeout" : detail.terminationReason }, key);
  } catch (error) {
    if (error instanceof ServerCooldown) return enrichDomainDetail({ domain, method, status: error.kind === "rate_limited" ? "rate_limited" : "error", responseTime: Math.round(performance.now() - run.startedAt), attempts,
      terminationReason: "server_cooldown", retryAt: new Date(error.until).toISOString(), retryAtSource: error.source, error: error.message });
    return enrichDomainDetail({ domain, method, status: run.signal.aborted ? "slow" : "error", attempts,
      responseTime: Math.round(performance.now() - run.startedAt),
      terminationReason: run.signal.aborted ? abortReason(run.signal, attempts) : error instanceof LimitStateError ? "limit_state_error" : error instanceof DOMException && error.name === "TimeoutError" ? "deadline_before_start" : "bootstrap_error",
      error: error instanceof Error ? error.message : String(error) });
  } finally { run.close(); }
}
