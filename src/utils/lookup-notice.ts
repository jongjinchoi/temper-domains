import type { LookupMetadata } from "../checker/types.ts";

export function lookupNoticeLines(result: LookupMetadata, local = false): string[] {
  if (!result.retryAt) return [];
  const date = new Date(result.retryAt);
  if (!Number.isFinite(date.getTime())) return [];
  const time = local ? date.toLocaleString("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }) : date.toISOString();
  const cause = result.terminationReason === "server_cooldown"
    ? (result.attempts ?? 0) === 0 ? "Not sent: previous server limit" : "Retry not sent: previous server limit"
    : result.terminationReason === "service_unavailable" ? "Server temporarily unavailable" : "Server limited this request";
  const source = result.retryAtSource === "server" ? "server Retry-After" : result.retryAtSource === "client_policy" ? "Temper wait; server gave no valid wait time" : "wait source unknown";
  return [`${cause}; attempts: ${result.attempts ?? 0} (${source})`, `Retry no earlier than ${time}`];
}

export function lookupNotice(result: LookupMetadata, local = false): string {
  return lookupNoticeLines(result, local).join("; ");
}
