import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { checkFullDomains } from "../checker/checker.ts";
import type { DomainResult, DomainStatus } from "../checker/types.ts";
import { type WatchEntry, loadWatchlist, removeWatch } from "../config/watchlist.ts";
import FrameBox from "./FrameBox.tsx";
import { getStatusStyle, theme } from "./theme.ts";
import { normalizePosition } from "./list-position.ts";
import ListViewport from "./ListViewport.tsx";
import { useListViewport } from "./hooks/useListViewport.ts";

interface WatchItem extends WatchEntry {
  status: DomainStatus | "checking";
  result?: DomainResult;
}

interface Props {
  onBack?: () => void;
  onQuit?: () => void;
}

export default function WatchlistView({ onBack, onQuit }: Props = {}) {
  const { exit } = useApp();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDomain, setPendingDomain] = useState<string | null>(null);
  const viewport = useListViewport();
  const deleting = useRef(false);
  const refreshQueued = useRef(false);
  const currentItems = useRef(items);
  currentItems.current = items;
  const selected = useRef({ domain: items[cursor]?.domain, cursor });
  selected.current = { domain: items[cursor]?.domain, cursor };
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const mutationId = useRef(0);

  const replaceItems = (next: WatchItem[]) => {
    const index = next.findIndex(item => item.domain === selected.current.domain);
    setCursor(normalizePosition({ cursor: index >= 0 ? index : selected.current.cursor, offset: 0 }, next.length, 1).cursor);
    setItems(next);
  };

  const checkAll = async (preserveActionError = false) => {
    if (deleting.current) { refreshQueued.current = true; return; }
    if (!preserveActionError) setActionError(null);
    abortRef.current?.abort();
    const runId = ++runIdRef.current;
    const beforeMutation = mutationId.current;
    const abortController = new AbortController();
    abortRef.current = abortController;
    let entriesLoaded = false;
    try {
      setLoadError(null);
      const watchlist = await loadWatchlist();
      if (cancelledRef.current || runId !== runIdRef.current) return;
      if (beforeMutation !== mutationId.current) return;
      const initial: WatchItem[] = watchlist.map((e) => ({ ...e, status: "checking" }));
      replaceItems(initial);
      setLoaded(true);
      entriesLoaded = true;
      for await (const result of checkFullDomains(
        watchlist.map((entry) => entry.domain),
        { concurrency: 10, timeoutMs: 8000, signal: abortController.signal },
      )) {
        if (cancelledRef.current || runId !== runIdRef.current) return;
        setItems((prev) => {
          const idx = prev.findIndex((item) => item.domain === result.domain);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx]!, status: result.status, result };
          return next;
        });
      }
    } catch (err) {
      if (cancelledRef.current || runId !== runIdRef.current) return;
      if (!entriesLoaded && beforeMutation !== mutationId.current) return;
      const error = err instanceof Error ? err.message : String(err);
      if (!entriesLoaded) {
        if (currentItems.current.length) setActionError(error);
        else setLoadError(error);
      }
      setLoaded(true);
      setItems((prev) => prev.map((item) => item.status === "checking"
        ? {
            ...item,
            status: "error",
            result: {
              domain: item.domain,
              tld: item.domain.split(".").pop() ?? "",
              status: "error",
              method: "rdap",
              responseTime: 0,
              error,
            },
          }
        : item,
      ));
    }
  };

  const deleteItem = async (domain: string) => {
    if (deleting.current) return;
    deleting.current = true;
    mutationId.current++;
    setPendingDomain(domain);
    setActionError(null);
    try {
      await removeWatch(domain);
      if (cancelledRef.current) return;
      replaceItems(currentItems.current.filter(item => item.domain !== domain));
    } catch (error) {
      if (cancelledRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
      try {
        const stored = await loadWatchlist();
        if (cancelledRef.current) return;
        const previous = new Map(currentItems.current.map(item => [item.domain, item]));
        replaceItems(stored.map(entry => previous.get(entry.domain) ?? { ...entry, status: "error" }));
      } catch {
        if (!cancelledRef.current) setActionError(`${message}. Could not reload the watchlist; press r to retry.`);
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
        setCursor((prev) => normalizePosition({ cursor: prev + 1, offset: 0 }, items.length, 1).cursor);
      } else if (key.upArrow || input === "k") {
        setCursor((prev) => Math.max(prev - 1, 0));
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
