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

export interface LiveResult {
  domain: string;
  tld: string;
  status: LiveStatus;
  method: LiveMethod;
  responseTime: number;
  error?: string;
}

export interface SearchCallbacks {
  onRow: (row: LiveResult) => void;
  onDone: (elapsedMs: number) => void;
  onError: (message: string) => void;
}

// next.config sets trailingSlash: true, so use /api/check/ directly to
// avoid a 308 redirect round-trip that would delay first byte.
const ENDPOINT = "/api/check/";

export async function runLiveSearch(
  name: string,
  callbacks: SearchCallbacks,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}`, { signal });
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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg["done"] === true && typeof msg["elapsed"] === "number") {
          callbacks.onDone(msg["elapsed"]);
        } else if (typeof msg["domain"] === "string") {
          callbacks.onRow(msg as unknown as LiveResult);
        } else if (typeof msg["error"] === "string") {
          callbacks.onError(msg["error"]);
        }
      }
    }
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return;
    callbacks.onError(err instanceof Error ? err.message : String(err));
  }
}
