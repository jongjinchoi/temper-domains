import { useEffect, useState } from "react";
import { checkDomains } from "../../checker/checker.ts";
import type { DomainResult } from "../../checker/types.ts";
import { DEFAULT_TLDS } from "../../checker/types.ts";
import { addHistory } from "../../config/history.ts";

interface SearchExecutionResult {
  results: Map<string, DomainResult>;
  count: number;
  elapsed: number;
  done: boolean;
  error: string | null;
}

export function useSearchExecution(
  query: string,
  tlds: readonly string[] = DEFAULT_TLDS,
  timeoutMs?: number,
): SearchExecutionResult {
  const [results, setResults] = useState<Map<string, DomainResult>>(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResults(new Map());
    setElapsed(0);
    setDone(false);
    setError(null);

    const abortController = new AbortController();
    const startTime = performance.now();
    const timer = setInterval(() => {
      setElapsed(Math.round(performance.now() - startTime));
    }, 100);

    (async () => {
      try {
        const collected: DomainResult[] = [];
        for await (const result of checkDomains(query, tlds, { timeoutMs, signal: abortController.signal })) {
          if (cancelled) return;
          collected.push(result);
          setResults((prev) => new Map(prev).set(result.domain, result));
        }
        if (!cancelled) {
          await addHistory({
            query,
            timestamp: new Date().toISOString(),
            available: collected.filter((r) => r.status === "available").length,
            total: tlds.length,
          }).catch(() => {});
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        clearInterval(timer);
        if (!cancelled) {
          setElapsed(Math.round(performance.now() - startTime));
          setDone(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      clearInterval(timer);
    };
  }, [query, tlds, timeoutMs]);

  return { results, count: results.size, elapsed, done, error };
}
