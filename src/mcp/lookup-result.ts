import { z } from "zod";
import type { CheckSummary, DomainResult } from "../checker/types.ts";
import { canResume, isAnswered } from "../checker/retry.ts";
import { summarizeResults } from "../checker/stream.ts";

export const lookupOutputSchema = {
  schemaVersion: z.literal(1),
  rows: z.array(z.object({
    domain: z.string(), tld: z.string(), status: z.enum(["available", "taken", "premium", "reserved", "rate_limited", "error", "slow"]),
    method: z.enum(["rdap", "whois"]), responseTime: z.number(), attempts: z.number().int().nonnegative().optional(),
    terminationReason: z.string().optional(), retryAt: z.string().optional(),
    retryAtSource: z.enum(["server", "client_policy"]).optional(), checkedAt: z.string().optional(), httpStatus: z.number().int().optional(),
  }).passthrough()),
  summary: z.object({ requested: z.number().int(), attempted: z.number().int(), answered: z.number().int(), unresolved: z.number().int(), elapsedMs: z.number() }),
  retryPlan: z.object({ eligible: z.array(z.string()), deferred: z.array(z.string()), blockedByRepair: z.array(z.string()),
    notRetryable: z.array(z.string()), nextRetryAt: z.string().optional(), maxPerCall: z.literal(100), requiresUserRequest: z.literal(true) }),
};

export function lookupResult(text: string, rows: readonly DomainResult[], summary = summarizeResults(rows, rows.length, 0)) {
  const eligible: string[] = [], deferred: string[] = [], blockedByRepair: string[] = [], notRetryable: string[] = [];
  let nextRetry = Infinity;
  const now = Date.now();
  for (const row of rows) {
    if (isAnswered(row)) continue;
    if (row.terminationReason === "limit_state_error") blockedByRepair.push(row.domain);
    else if (!canResume(row)) notRetryable.push(row.domain);
    else {
      const retryAt = Date.parse(row.retryAt ?? "");
      if (retryAt > now) { deferred.push(row.domain); nextRetry = Math.min(nextRetry, retryAt); }
      else eligible.push(row.domain);
    }
  }
  const structuredContent = { schemaVersion: 1 as const, rows: [...rows], summary: summary as CheckSummary,
    retryPlan: { eligible, deferred, blockedByRepair, notRetryable, ...(Number.isFinite(nextRetry) ? { nextRetryAt: new Date(nextRetry).toISOString() } : {}),
      maxPerCall: 100 as const, requiresUserRequest: true as const } };
  return { content: [{ type: "text" as const, text }, { type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent };
}
