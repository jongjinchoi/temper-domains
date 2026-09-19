import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { type HistoryEntry, HistoryConflictError, loadHistory, removeHistoryAt } from "../config/history.ts";
import FrameBox from "./FrameBox.tsx";
import SearchView from "./SearchView.tsx";
import { theme } from "./theme.ts";

interface Props {
  onBack?: () => void;
  onQuit?: () => void;
}

export default function HistoryView({ onBack, onQuit }: Props = {}) {
  const { exit } = useApp();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const deleting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    loadHistory().then((h) => {
      if (cancelled) return;
      setHistory(h);
      setLoaded(true);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoaded(true);
    });
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  useInput(
    (input, key) => {
      if (input === "q") { onQuit ? onQuit() : exit(); return; }
      if (key.escape) { onBack ? onBack() : exit(); return; }
      if (deleting.current) return;
      if (key.downArrow || input === "j") {
        setCursor((prev) => Math.min(prev + 1, history.length - 1));
      } else if (key.upArrow || input === "k") {
        setCursor((prev) => Math.max(prev - 1, 0));
      } else if (input === "d" && history[cursor]) {
        const idx = cursor;
        deleting.current = true;
        setDeletePending(true);
        setDeleteError(null);
        removeHistoryAt(idx, history).then((next) => {
          if (!mounted.current) return;
          setHistory(next);
          setCursor(Math.max(0, Math.min(idx, next.length - 1)));
        }).catch((error: unknown) => {
          if (!mounted.current) return;
          if (error instanceof HistoryConflictError) {
            setHistory(error.current);
            setCursor(0);
          }
          setDeleteError(error instanceof Error ? error.message : String(error));
        }).finally(() => {
          deleting.current = false;
          if (mounted.current) setDeletePending(false);
        });
      } else if (key.return && history[cursor]) {
        setSelectedQuery(history[cursor]!.query);
      }
    },
    { isActive: !selectedQuery && process.stdin.isTTY === true },
  );

  const hints = onBack
    ? [
        { key: "j/k", action: "move" },
        { key: "enter", action: "re-search" },
        { key: "d", action: "remove" },
        { key: "esc", action: "back" },
        { key: "q", action: "quit" },
      ]
    : [
        { key: "j/k", action: "move" },
        { key: "enter", action: "re-search" },
        { key: "d", action: "remove" },
        { key: "q", action: "quit" },
      ];

  if (!loaded) return null;

  if (loadError) {
    return <FrameBox title="Recent searches" hints={hints}><Text color={theme.red}>{loadError}</Text></FrameBox>;
  }

  if (selectedQuery) {
    return <SearchView query={selectedQuery} onBack={() => setSelectedQuery(null)} />;
  }

  if (history.length === 0) {
    return (
      <FrameBox title="Recent searches" hints={[{ key: "q", action: "quit" }]}>
        {deleteError && <Text color={theme.red}>{deleteError}</Text>}
        <Text color={theme.dim}>No search history yet.</Text>
      </FrameBox>
    );
  }

  return (
    <FrameBox title="Recent searches" hints={hints}>
      {deleteError && <Text color={theme.red}>{deleteError}</Text>}
      {deletePending && <Text color={theme.dim}>Deleting history entry...</Text>}
      {/* Table header */}
      <Box marginBottom={0}>
        <Text color={theme.dim}>{"DATE".padEnd(18)}{"QUERY".padEnd(16)}{"TLDs".padEnd(8)}{"RESULT"}</Text>
      </Box>

      {/* Rows */}
      {history.map((entry, i) => {
        const date = new Date(entry.timestamp);
        const dateStr = `${date.toISOString().slice(0, 10)} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
        const isSelected = i === cursor;

        return (
          <Box key={`${entry.query}-${entry.timestamp}`}>
            {isSelected ? <Text color={theme.primary}>▸</Text> : <Text> </Text>}
            <Text color={theme.dim}>{dateStr.padEnd(18)}</Text>
            <Text color={theme.text}>{entry.query.padEnd(16)}</Text>
            <Text color={theme.lavender}>{String(entry.total).padEnd(8)}</Text>
            <Text color={theme.green}>{entry.available} avail</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color={theme.dim}>Total: {history.length} searches · ~/.temper/history.json</Text>
      </Box>
    </FrameBox>
  );
}
