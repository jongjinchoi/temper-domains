import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useReducer, useRef, useState } from "react";
import { checkFullDomains } from "../checker/checker.ts";
import { loadWatchlist, removeWatch } from "../config/watchlist.ts";
import { formatStorageError } from "../utils/storage-error.ts";
import FrameBox from "./FrameBox.tsx";
import { getStatusStyle, theme } from "./theme.ts";
import ListViewport from "./ListViewport.tsx";
import { useListViewport } from "./hooks/useListViewport.ts";
import { initialWatchlistState, watchlistReducer } from "./watchlist-state.ts";

interface Props {
  onBack?: () => void;
  onQuit?: () => void;
}

export default function WatchlistView({ onBack, onQuit }: Props = {}) {
  const { exit } = useApp();
  // Rows, selection and errors change together; async completions dispatch
  // against the latest queued state instead of a render-time snapshot.
  const [{ items, cursor, loadError, actionError }, dispatch] = useReducer(watchlistReducer, initialWatchlistState);
  const [loaded, setLoaded] = useState(false);
  const [pendingDomain, setPendingDomain] = useState<string | null>(null);
  const viewport = useListViewport();
  // Async flow control only; these do not mirror rendered state.
  const deleting = useRef(false);
  const refreshQueued = useRef(false);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const mutationId = useRef(0);

  const checkAll = async (preserveActionError = false) => {
    if (deleting.current) { refreshQueued.current = true; return; }
    dispatch({ type: "loadStarted", preserveActionError });
    abortRef.current?.abort();
    const runId = ++runIdRef.current;
    const beforeMutation = mutationId.current;
    const abortController = new AbortController();
    abortRef.current = abortController;
    let entriesLoaded = false;
    try {
      const watchlist = await loadWatchlist();
      if (cancelledRef.current || runId !== runIdRef.current) return;
      if (beforeMutation !== mutationId.current) return;
      dispatch({ type: "loaded", entries: watchlist });
      setLoaded(true);
      entriesLoaded = true;
      for await (const result of checkFullDomains(
        watchlist.map((entry) => entry.domain),
        { concurrency: 10, timeoutMs: 8000, signal: abortController.signal },
      )) {
        if (cancelledRef.current || runId !== runIdRef.current) return;
        dispatch({ type: "result", result });
      }
    } catch (err) {
      if (cancelledRef.current || runId !== runIdRef.current) return;
      if (!entriesLoaded && beforeMutation !== mutationId.current) return;
      const error = err instanceof Error ? err.message : String(err);
      dispatch({ type: "loadFailed", error, entriesLoaded });
      setLoaded(true);
    }
  };

  const deleteItem = async (domain: string) => {
    if (deleting.current) return;
    deleting.current = true;
    mutationId.current++;
    setPendingDomain(domain);
    dispatch({ type: "deleteStarted" });
    try {
      await removeWatch(domain);
      if (cancelledRef.current) return;
      dispatch({ type: "removed", domain });
    } catch (error) {
      if (cancelledRef.current) return;
      const message = formatStorageError(error);
      dispatch({ type: "deleteFailed", error: message });
      try {
        const stored = await loadWatchlist();
        if (cancelledRef.current) return;
        dispatch({ type: "reconciled", entries: stored });
      } catch {
        if (!cancelledRef.current) dispatch({ type: "reloadFailed", error: message });
      }
    } finally {
      deleting.current = false;
      if (!cancelledRef.current) {
        setPendingDomain(null);
        if (refreshQueued.current) { refreshQueued.current = false; void checkAll(true); }
      }
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    checkAll();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  useInput(
    (input, key) => {
      if (input === "q") { onQuit ? onQuit() : exit(); return; }
      if (key.escape) { onBack ? onBack() : exit(); return; }
      if (input === "r") {
        // Refresh targets no row, including the empty and error screens.
        cancelledRef.current = false;
        checkAll();
        return;
      }
      // Row actions require the selected row to be on screen.
      if (!viewport.visible) return;
      if (key.downArrow || input === "j") {
        dispatch({ type: "move", delta: 1 });
      } else if (key.upArrow || input === "k") {
        dispatch({ type: "move", delta: -1 });
      } else if (input === "d" && !loadError) {
        const item = items[cursor];
        if (item) void deleteItem(item.domain);
      }
    },
    { isActive: process.stdin.isTTY === true },
  );

  const hints = onBack
    ? [
        { key: "j/k", action: "move" },
        { key: "r", action: "refresh" },
        { key: "d", action: "remove" },
        { key: "esc", action: "back" },
        { key: "q", action: "quit" },
      ]
    : [
        { key: "j/k", action: "move" },
        { key: "r", action: "refresh" },
        { key: "d", action: "remove" },
        { key: "q", action: "quit" },
      ];

  if (!loaded) return null;

  if (loadError) {
    return <FrameBox fit title="Watchlist" hints={hints}><Text color={theme.red}>{loadError}</Text></FrameBox>;
  }

  if (items.length === 0) {
    return (
      <FrameBox fit title="Watchlist" hints={hints}>
        {actionError && <Text color={theme.red}>{actionError}</Text>}
        <Text color={theme.dim}>Watchlist is empty. Use: temper watch {"<domain>"}</Text>
      </FrameBox>
    );
  }

  return (
    <FrameBox fit title="Watchlist" hints={hints}>
      {actionError && <Text color={theme.red}>{actionError}</Text>}
      {pendingDomain && <Text color={theme.dim}>Removing {pendingDomain}...</Text>}
      <ListViewport viewport={viewport} cursor={cursor} rows={items.map((item, i) => {
        const isSelected = i === cursor;
        const { icon, color } = item.status === "checking"
          ? { icon: "…", color: theme.dim }
          : getStatusStyle(item.status);
        const addedAgo = formatAgo(item.addedAt);
        const detail = item.result
          ? ` ${item.result.method} ${item.result.responseTime}ms${item.result.error ? ` ${item.result.error}` : ""}`
          : "";

        return { key: item.domain, content: (
          <Box>
            <Box width={2} flexShrink={0}>{isSelected ? <Text color={theme.primary}>▸ </Text> : <Text>  </Text>}</Box>
            <Text color={theme.text}>{item.domain.padEnd(22)}</Text>
            <Text color={color}>{icon} {item.status.padEnd(12)}</Text>
            {detail && <Text color={theme.dim}>{detail.padEnd(18)}</Text>}
            <Text color={theme.dim}>{addedAgo}</Text>
          </Box>
        ) };
      })} />

      <Box marginTop={1} flexShrink={0}>
        <Text color={theme.dim}>{items.length} watched · ~/.temper/watchlist.json</Text>
      </Box>
    </FrameBox>
  );
}

function formatAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
