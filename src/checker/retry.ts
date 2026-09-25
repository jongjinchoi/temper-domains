import type { DomainResult, TerminationReason } from "./types.ts";

export const isAnswered = (row: Pick<DomainResult, "status">): boolean =>
  ["available", "taken", "premium", "reserved"].includes(row.status);
const retryable = new Set<TerminationReason>(["rate_limited", "server_cooldown", "service_unavailable", "request_timeout",
  "deadline", "deadline_before_start", "network_error", "bootstrap_error", "cancelled"]);
export function canResume(row: DomainResult): boolean {
  return !isAnswered(row) && row.terminationReason !== undefined && retryable.has(row.terminationReason);
}
