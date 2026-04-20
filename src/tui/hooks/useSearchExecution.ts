import { useEffect, useRef, useState } from "react";
import { checkDomains } from "../../checker/checker.ts";
import type { DomainResult } from "../../checker/types.ts";
import { DEFAULT_TLDS } from "../../checker/types.ts";
import { addHistory } from "../../config/history.ts";

interface SearchExecutionResult {
  results: Map<string, DomainResult>;
  count: number;
  elapsed: number;
  done: boolean;
}

export function useSearchExecution(
  query: string,
  tlds: readonly string[] = DEFAULT_TLDS,
  timeoutMs?: number,
): SearchExecutionResult {
  const [results, setResults] = useState<Map<string, DomainResult>>(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setResults(new Map());
    setElapsed(0);
    setDone(false);

    const abortController = new AbortController();
    const startTime = performance.now();
    const timer = setInterval(() => {
      setElapsed(Math.round(performance.now() - startTime));
    }, 100);

    (async () => {
      const collected: DomainResult[] = [];
      for await (const result of checkDomains(query, tlds, { timeoutMs, signal: abortController.signal })) {
        if (cancelledRef.current) break;
        collected.push(result);
        setResults((prev) => new Map(prev).set(result.domain, result));
      }
      clearInterval(timer);
      setElapsed(Math.round(performance.now() - startTime));
      if (!cancelledRef.current) {
        setDone(true);
        addHistory({
          query,
          timestamp: new Date().toISOString(),
          available: collected.filter((r) => r.status === "available").length,
          total: tlds.length,
        }).catch(() => {});
      }
    })();

    return () => {
      cancelledRef.current = true;
      abortController.abort();
      clearInterval(timer);
    };
  }, [query, tlds, timeoutMs]);

  return { results, count: results.size, elapsed, done };
}
