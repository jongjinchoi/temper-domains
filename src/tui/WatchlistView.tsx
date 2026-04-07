import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { dnsCheck } from "../checker/dns.ts";
import { type WatchEntry, loadWatchlist, removeWatch } from "../config/watchlist.ts";
import FrameBox from "./FrameBox.tsx";
import { theme } from "./theme.ts";

interface WatchItem extends WatchEntry {
  status: "available" | "taken" | "error" | "checking";
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

  const checkAll = async () => {
    const watchlist = await loadWatchlist();
    const initial: WatchItem[] = watchlist.map((e) => ({ ...e, status: "checking" }));
    setItems(initial);
    setLoaded(true);

    for (let i = 0; i < watchlist.length; i++) {
      const status = await dnsCheck(watchlist[i]!.domain);
      setItems((prev) => {
        const next = [...prev];
        next[i] = { ...next[i]!, status };
        return next;
      });
    }
  };

  useEffect(() => {
    checkAll();
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
        checkAll();
      } else if (input === "d") {
        const item = items[cursor];
        if (item) {
          removeWatch(item.domain);
          setItems((prev) => prev.filter((_, i) => i !== cursor));
          setCursor((prev) => Math.min(prev, items.length - 2));
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

  const statusIcon = (status: string) => {
    switch (status) {
      case "available": return { icon: "✓", color: theme.green };
      case "taken": return { icon: "✗", color: theme.red };
      case "checking": return { icon: "…", color: theme.dim };
      default: return { icon: "✗", color: theme.red };
    }
  };

  return (
    <FrameBox title="Watchlist" hints={hints}>
      {items.map((item, i) => {
        const isSelected = i === cursor;
        const { icon, color } = statusIcon(item.status);
        const addedAgo = formatAgo(item.addedAt);

        return (
          <Box key={item.domain}>
            {isSelected ? <Text color={theme.primary}>▸ </Text> : <Text>  </Text>}
            <Text color={theme.text}>{item.domain.padEnd(22)}</Text>
            <Text color={color}>{icon} {item.status.padEnd(12)}</Text>
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
