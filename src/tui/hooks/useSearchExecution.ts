import { useEffect, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_TLDS } from "../../checker/types.ts";
import { SearchSession } from "../search-session.ts";

export function useSearchExecution(query: string, tlds: readonly string[] = DEFAULT_TLDS, timeoutMs?: number, owner?: SearchSession) {
  const session = useMemo(() => owner ?? new SearchSession(query, tlds, timeoutMs), [owner, query, tlds, timeoutMs]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    void session.start();
    return () => session.cancel();
  }, [session]);
  return { ...snapshot, session };
}
