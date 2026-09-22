import { ServerCooldown } from "./limits.ts";
import { requestScheduler } from "./scheduler.ts";
import { WHOIS_PROFILES } from "./services.ts";
import { getTld } from "../utils/domain.ts";
import type { LookupContext } from "./run.ts";
import type { DomainDetail, DomainResult } from "./types.ts";

export function whoisServerKey(domain: string): string { return `whois://${WHOIS_PROFILES[getTld(domain)]?.host ?? getTld(domain)}:43`; }
export async function runWhoisRequest<T extends DomainDetail | DomainResult>(domain: string, signal: AbortSignal, context: LookupContext, query: () => Promise<T>): Promise<T> {
  if (!WHOIS_PROFILES[getTld(domain)]) return query();
  const key = whoisServerKey(domain);
  while (true) {
  const permit = await context.limits.acquire(key, context.deadline, signal);
  try {
    return await requestScheduler.run(key, context.scope, async () => {
      await permit.check();
      signal.throwIfAborted();
      const result = await query();
      if (result.status === "rate_limited") {
        return { ...result, terminationReason: "rate_limited", ...await permit.limited("rate_limited") };
      }
      if (["taken", "available", "premium", "reserved"].includes(result.status)) await permit.answered();
      return result;
    }, signal);
  } catch (error) {
    if (!(error instanceof ServerCooldown) || error.until >= context.deadline || signal.aborted) throw error;
  } finally { await permit.release(); }
  }
}
