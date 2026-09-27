import { whoisServerKey } from "./whois-request.ts";
import { lookupPlan, preferredWhoisPlan, type LookupPlan } from "./services.ts";
import { lookupDomainAvailability } from "./lookup.ts";
import { enrichDomainResult, getDomainInputError } from "./policy.ts";
import { createRun, abortReason, waitWithSignal } from "./run.ts";
import { requestScheduler, serverKey } from "./scheduler.ts";
import { streamDomainResults, summarizeResults, type CheckOptions } from "./stream.ts";
import type { DomainResult } from "./types.ts";
import { getTld } from "../utils/domain.ts";

export async function* checkDomainBatch(domains: readonly string[], options: CheckOptions,
  bootstrap: () => Promise<Map<string, string>>): AsyncGenerator<DomainResult> {
  const run = createRun(options.timeoutMs ?? 30000, options.signal, options.concurrency, options.requestTimeoutMs, options.limits);
  if (options.resume) run.context.stoppedServers = new Map();
  const rows: DomainResult[] = [];
  try {
    const inputs = domains.map(domain => ({ domain, error: getDomainInputError(domain), preferred: preferredWhoisPlan(domain) }));
    const budget = async (plans: readonly (LookupPlan | undefined)[]) => {
      if (options.timeoutMs !== undefined || run.signal.aborted) return;
      const keys = plans.flatMap((plan, i) => !plan || inputs[i]!.error ? [] :
        [plan.method === "rdap" ? serverKey(plan.endpoints[0]!) : whoisServerKey(domains[i]!)]);
      // Best-effort estimate only. Authoritative admission still reports storage
      // failures on each affected row, before any network request is sent.
      const sharedWait = await run.context.limits.estimateWait(keys, run.signal).catch(() => 0);
      const elapsed = performance.now() - run.startedAt;
      if (!run.signal.aborted) run.setBudget(Math.min(30000, Math.max(5000, elapsed + Math.max(sharedWait, requestScheduler.estimateWait(keys)) + run.context.requestTimeoutMs)));
    };
    // Only dependent rows await this shared preparation. Preferred WHOIS rows
    // can dispatch while IANA is loading; the initial 30s ceiling still applies.
    let preparation: Promise<LookupPlan[]> | undefined;
    const prepare = () => preparation ??= (async () => {
      run.signal.throwIfAborted();
      const map = await waitWithSignal(bootstrap(), run.signal);
      const plans = inputs.map(input => input.preferred ?? lookupPlan(input.domain, map));
      await budget(plans);
      return plans;
    })();
    if (inputs.every(input => input.error || input.preferred)) await budget(inputs.map(input => input.preferred));
    const pending = new Map<string, Promise<DomainResult>>();
    let index = 0;
    for await (const row of streamDomainResults(domains, { ...options, signal: run.signal }, async (domain, signal) => {
      const position = index++;
      const input = inputs[position]!;
      if (input.error) return enrichDomainResult({ domain, tld: getTld(domain), status: "error",
        method: "whois", responseTime: 0, attempts: 0, terminationReason: "invalid_input", error: input.error }, getTld(domain));
      let plan: LookupPlan;
      try {
        signal.throwIfAborted();
        plan = input.preferred ?? (await prepare())[position]!;
      } catch (error) {
        return enrichDomainResult({ domain, tld: getTld(domain), status: signal.aborted ? "slow" : "error",
          method: input.preferred ? "whois" : "rdap", responseTime: 0, attempts: 0,
          terminationReason: signal.aborted ? abortReason(signal, 0) : "bootstrap_error",
          error: error instanceof Error ? error.message : String(error) });
      }
      let result = pending.get(domain);
      if (!result) {
        result = lookupDomainAvailability(domain, plan.method === "rdap" ? plan.endpoints[0]! : null,
          signal, run.context.requestTimeoutMs, plan.key, run.context, plan.method === "rdap" ? plan.endpoints : []);
        pending.set(domain, result);
      }
      return result;
    })) { rows.push(row); yield row; }
  } finally {
    run.close();
    options.onSummary?.(summarizeResults(rows, domains.length, performance.now() - run.startedAt));
  }
}
