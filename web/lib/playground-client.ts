import type { CheckSummary, LookupMetadata } from "../../src/checker/types.ts";
export type { CheckSummary } from "../../src/checker/types.ts";

// Browser-side streaming reader for /api/check. Parses NDJSON lines and
// dispatches to callbacks so the Playground CRT can append rows as they
// resolve, matching the CLI's AsyncGenerator feel.

export type LiveStatus =
  | "available"
  | "taken"
  | "premium"
  | "reserved"
  | "rate_limited"
  | "error"
  | "slow";

export type LiveMethod = "rdap" | "whois";
export type LiveConfidence = "high" | "medium" | "low";
export type LiveDisplayStatus = LiveStatus | "review";

export interface LiveResult extends LookupMetadata {
  domain: string;
  tld: string;
  rdapKey?: string;
  publicSuffix?: string;
  registrableDomain?: string;
  status: LiveStatus;
  method: LiveMethod;
  responseTime: number;
  confidence?: LiveConfidence;
  reason?: string;
  error?: string;
}

export interface SearchCallbacks {
  onRow: (row: LiveResult) => void;
  onDone: (elapsedMs: number, summary?: CheckSummary) => void;
  onError: (message: string) => void;
}

function readSummary(value: unknown): CheckSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const summary = value as CheckSummary;
  return [summary.requested, summary.attempted, summary.answered, summary.unresolved, summary.elapsedMs]
    .every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) ? summary : undefined;
}

export function getLiveDisplayStatus(result: LiveResult): LiveDisplayStatus {
  if (result.status === "available" && result.confidence === "low") return "review";
  return result.status;
}

// next.config sets trailingSlash: true, so use /api/check/ directly to
// avoid a 308 redirect round-trip that would delay first byte.
const ENDPOINT = "/api/check/";

export async function runLiveSearch(
  name: string,
  callbacks: SearchCallbacks,
  signal: AbortSignal,
  tlds?: readonly string[],
): Promise<void> {
  if (signal.aborted) return;
  const qs = new URLSearchParams({ name });
  if (tlds && tlds.length > 0) qs.set("tlds", tlds.join(","));
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${qs.toString()}`, { signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return;
    callbacks.onError(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!res.ok || !res.body) {
    callbacks.onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let terminal = false;

  const consume = (line: string) => {
    if (terminal || signal.aborted || !line.trim()) return;
    const msg = JSON.parse(line) as Record<string, unknown>;
    if (msg["done"] === true && typeof msg["elapsed"] === "number") {
      terminal = true;
      callbacks.onDone(msg["elapsed"], readSummary(msg["summary"]));
    } else if (typeof msg["error"] === "string" && typeof msg["domain"] !== "string") {
      terminal = true;
      callbacks.onError(msg["error"]);
    } else if (typeof msg["domain"] === "string") {
      callbacks.onRow(msg as unknown as LiveResult);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) return;
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        consume(line);
      }
      if (terminal) return;
    }
    consume(buf + decoder.decode());
    if (!terminal && !signal.aborted) callbacks.onError("Search response was incomplete. Please try again.");
  } catch (err) {
    if (signal.aborted || (err as { name?: string })?.name === "AbortError") return;
    if (!terminal) callbacks.onError(err instanceof Error ? err.message : String(err));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
