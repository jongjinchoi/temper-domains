import { setTimeout as delay } from "node:timers/promises";
import type { LimitPermit } from "./limits.ts";
import { ServerCooldown } from "./limits.ts";
import type { LookupContext } from "./run.ts";
import { requestScheduler } from "./scheduler.ts";

// A denied admission returns its local slot before any policy wait. All network
// work and the permit's release remain within a successful scheduler turn.
export async function withAdmission<T>(key: string, context: LookupContext, signal: AbortSignal,
  query: (permit: LimitPermit) => Promise<T>): Promise<T> {
  while (true) {
    signal.throwIfAborted();
    const stopped = context.stoppedServers?.get(key);
    if (stopped) throw stopped;
    const attempt = await requestScheduler.run(key, context.scope, async () => {
      const stopped = context.stoppedServers?.get(key);
      if (stopped) throw stopped;
      const admission = await context.limits.tryAcquire(key, context.deadline, signal);
      if (!admission.permit) return { wait: admission.wait };
      const permit = admission.permit;
      try { await permit.check(); signal.throwIfAborted(); return { result: await query(permit) }; }
      finally { await permit.release(); }
    }, signal);
    if ("result" in attempt) return attempt.result as T;
    await delay(Math.min(attempt.wait!, 100), undefined, { signal });
  }
}

export function stopLimitedServer(context: LookupContext, key: string, kind: "rate_limited" | "service_unavailable",
  metadata: { retryAt: string; retryAtSource: "server" | "client_policy" }): void {
  context.stoppedServers?.set(key, new ServerCooldown(Date.parse(metadata.retryAt), metadata.retryAtSource, kind));
}
