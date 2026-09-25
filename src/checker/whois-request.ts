import { ServerCooldown } from "./limits.ts";
import { withAdmission, stopLimitedServer } from "./admission.ts";
import { WHOIS_PROFILES } from "./services.ts";
import { getTld } from "../utils/domain.ts";
import type { LookupContext } from "./run.ts";
import type { DomainDetail, DomainResult } from "./types.ts";

export function whoisServerKey(domain: string): string { return `whois://${WHOIS_PROFILES[getTld(domain)]?.host ?? getTld(domain)}:43`; }
export async function runWhoisRequest<T extends DomainDetail | DomainResult>(domain: string, signal: AbortSignal, context: LookupContext, query: () => Promise<T>): Promise<T> {
  if (!WHOIS_PROFILES[getTld(domain)]) return query();
  const key = whoisServerKey(domain);
  while (true) {
  try {
    return await withAdmission(key, context, signal, async (permit) => {
      signal.throwIfAborted();
      const result = await query();
      if (result.status === "rate_limited") {
        const metadata = await permit.limited("rate_limited");
        stopLimitedServer(context, key, "rate_limited", metadata);
        return { ...result, terminationReason: "rate_limited", ...metadata };
      }
      if (["taken", "available", "premium", "reserved"].includes(result.status)) {
        await permit.answered();
        return { ...result, checkedAt: new Date().toISOString() };
      }
      return result;
    });
  } catch (error) {
    if (!(error instanceof ServerCooldown) || context.stoppedServers || error.until >= context.deadline || signal.aborted) throw error;
  }
  }
}
