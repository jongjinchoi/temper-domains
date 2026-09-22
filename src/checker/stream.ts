import type { LimitCoordinator } from "./limits.ts";
import { getTld } from "../utils/domain.ts";
import type { CheckSummary, DomainResult } from "./types.ts";

export interface CheckOptions {
  limits?: LimitCoordinator;
  concurrency?: number;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  onSummary?: (summary: CheckSummary) => void;
}
export function summarizeResults(results: readonly DomainResult[], requested: number, elapsedMs: number): CheckSummary {
  const answered = results.filter(r => ["available", "taken", "premium", "reserved"].includes(r.status)).length;
  return { requested, attempted: results.filter(r => (r.attempts ?? 0) > 0).length, answered,
    unresolved: requested - answered, elapsedMs: Math.round(elapsedMs) };
}
export async function* streamDomainResults(
  domains: readonly string[],
  options: CheckOptions,
  checkDomain: (domain: string, signal: AbortSignal) => Promise<DomainResult>,
): AsyncGenerator<DomainResult> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const results: DomainResult[] = [];
  let wake: (() => void) | undefined;
  const tasks = domains.map(async domain => {
    try { results.push(await checkDomain(domain, signal)); }
    catch (error) {
      results.push({ domain, tld: getTld(domain), status: "error", method: "rdap", responseTime: 0,
        terminationReason: "network_error", error: error instanceof Error ? error.message : String(error) });
    }
    wake?.();
  });
  try {
    let yielded = 0;
    while (yielded < domains.length) {
      if (yielded < results.length) yield results[yielded++]!;
      else await new Promise<void>(resolve => { wake = resolve; });
    }
    await Promise.all(tasks);
  } finally { controller.abort(); }
}
