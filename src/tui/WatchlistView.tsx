import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { checkFullDomains } from "../checker/checker.ts";
import type { DomainResult, DomainStatus } from "../checker/types.ts";
import { type WatchEntry, loadWatchlist, removeWatch } from "../config/watchlist.ts";
import FrameBox from "./FrameBox.tsx";
import { getStatusStyle, theme } from "./theme.ts";

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
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const checkAll = async () => {
    abortRef.current?.abort();
    const runId = ++runIdRef.current;
    const abortController = new AbortController();
    abortRef.current = abortController;
    const watchlist = await loadWatchlist();
    if (cancelledRef.current || runId !== runIdRef.current) return;
    const initial: WatchItem[] = watchlist.map((e) => ({ ...e, status: "checking" }));
    setItems(initial);
    setLoaded(true);

    try {
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
      const error = err instanceof Error ? err.message : String(err);
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
      if (key.downArrow || input === "j") {
        setCursor((prev) => Math.min(prev + 1, items.length - 1));
      } else if (key.upArrow || input === "k") {
        setCursor((prev) => Math.max(prev - 1, 0));
      } else if (input === "r") {
        cancelledRef.current = false;
        checkAll();
      } else if (input === "d") {
        const item = items[cursor];
        if (item) {
          const idx = cursor;
          const original = items;
          const next = items.filter((_, i) => i !== idx);
          setItems(next);
          setCursor((prev) => Math.min(prev, next.length - 1));
          removeWatch(item.domain).catch(() => {
            setItems(original);
          });
        }
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

  if (items.length === 0) {
    return (
      <FrameBox title="Watchlist" hints={[{ key: "q", action: "quit" }]}>
        <Text color={theme.dim}>Watchlist is empty. Use: temper watch {"<domain>"}</Text>
      </FrameBox>
    );
  }

  return (
    <FrameBox title="Watchlist" hints={hints}>
      {items.map((item, i) => {
        const isSelected = i === cursor;
        const { icon, color } = item.status === "checking"
          ? { icon: "…", color: theme.dim }
          : getStatusStyle(item.status);
        const addedAgo = formatAgo(item.addedAt);
        const detail = item.result
          ? ` ${item.result.method} ${item.result.responseTime}ms${item.result.error ? ` ${item.result.error}` : ""}`
          : "";

        return (
          <Box key={item.domain}>
            {isSelected ? <Text color={theme.primary}>▸ </Text> : <Text>  </Text>}
            <Text color={theme.text}>{item.domain.padEnd(22)}</Text>
            <Text color={color}>{icon} {item.status.padEnd(12)}</Text>
            {detail && <Text color={theme.dim}>{detail.padEnd(18)}</Text>}
            <Text color={theme.dim}>{addedAgo}</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
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
