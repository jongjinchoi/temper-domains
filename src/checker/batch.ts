import { lookupPlan } from "./services.ts";
import { lookupDomainAvailability } from "./lookup.ts";
import { enrichDomainResult, getDomainInputError } from "./policy.ts";
import { createRun, abortReason, waitWithSignal } from "./run.ts";
import { requestScheduler, serverKey } from "./scheduler.ts";
import { streamDomainResults, summarizeResults, type CheckOptions } from "./stream.ts";
import type { DomainResult } from "./types.ts";
import { getTld } from "../utils/domain.ts";

export async function* checkDomainBatch(domains: readonly string[], options: CheckOptions,
  bootstrap: () => Promise<Map<string, string>>): AsyncGenerator<DomainResult> {
  const run = createRun(options.timeoutMs ?? 30000, options.signal, options.concurrency, options.requestTimeoutMs);
  const rows: DomainResult[] = [];
  try {
    let map: Map<string, string>;
    try {
      run.signal.throwIfAborted();
      map = domains.some(d => !getDomainInputError(d)) ? await waitWithSignal(bootstrap(), run.signal) : new Map();
    } catch (error) {
      for (const domain of domains) {
        const inputError = getDomainInputError(domain);
        const row = enrichDomainResult({ domain, tld: getTld(domain), status: run.signal.aborted && !inputError ? "slow" : "error",
          method: "rdap", responseTime: 0, attempts: 0,
          terminationReason: inputError ? "invalid_input" : run.signal.aborted ? abortReason(run.signal, 0) : "bootstrap_error",
          error: inputError ?? (error instanceof Error ? error.message : String(error)) });
        rows.push(row); yield row;
      }
      return;
    }
    const matches = domains.map(domain => {
      const plan = lookupPlan(domain, map);
      return { rdapKey: plan.key, rdapUrl: plan.method === "rdap" ? plan.endpoints[0]! : null, endpoints: plan.method === "rdap" ? plan.endpoints : [] };
    });
    if (options.timeoutMs === undefined) {
      const keys = matches.map((m, i) => m.rdapUrl ? serverKey(m.rdapUrl) : `whois:${getTld(domains[i]!)}`);
      const elapsed = performance.now() - run.startedAt;
      run.setBudget(Math.min(30000, Math.max(5000, elapsed + requestScheduler.estimateWait(keys) + run.context.requestTimeoutMs)));
    }
    let index = 0;
    for await (const row of streamDomainResults(domains, { ...options, signal: run.signal }, async (domain, signal) => {
      const match = matches[index++]!;
      const inputError = getDomainInputError(domain);
      if (inputError) return enrichDomainResult({ domain, tld: getTld(domain), status: "error",
        method: match.rdapUrl ? "rdap" : "whois", responseTime: 0, attempts: 0,
        terminationReason: "invalid_input", error: inputError }, match.rdapKey);
      return lookupDomainAvailability(domain, match.rdapUrl, signal, run.context.requestTimeoutMs, match.rdapKey, run.context, match.endpoints);
    })) { rows.push(row); yield row; }
  } finally {
    run.close();
    options.onSummary?.(summarizeResults(rows, domains.length, performance.now() - run.startedAt));
  }
}
