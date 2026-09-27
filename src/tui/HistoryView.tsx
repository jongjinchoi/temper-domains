import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { type HistoryEntry, HistoryConflictError, loadHistory, removeHistoryAt } from "../config/history.ts";
import { formatStorageError } from "../utils/storage-error.ts";
import FrameBox from "./FrameBox.tsx";
import SearchView from "./SearchView.tsx";
import { theme } from "./theme.ts";
import { formatHistoryTimestamp } from "./format-date.ts";
import ListViewport from "./ListViewport.tsx";
import { normalizePosition } from "./list-position.ts";
import { useListViewport } from "./hooks/useListViewport.ts";
import { DEFAULT_TLDS } from "../checker/types.ts";
import { SearchSession } from "./search-session.ts";

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
  const [selectedSession, setSelectedSession] = useState<SearchSession | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const deleting = useRef(false);
  const refreshing = useRef(false);
  const mounted = useRef(true);
  const viewport = useListViewport();

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

  const returnToHistory = async (session: SearchSession) => {
    if (refreshing.current || !mounted.current) return;
    refreshing.current = true;
    setRefreshPending(true);
    setSelectedSession(null);
    setLoadError(null);
    setDeleteError(null);
    setSaveError(null);
    session.cancel();
    try {
      try { await session.waitForHistory(); }
      catch (error) { if (mounted.current) setSaveError(formatStorageError(error)); }
      if (!mounted.current) return;
      // Read even after a save error: replacement may have succeeded before
      // cleanup failed, and the stored list is the authority for row actions.
      const next = await loadHistory();
      if (!mounted.current) return;
      setHistory(next);
      setCursor(previous => Math.max(0, Math.min(previous, next.length - 1)));
    } catch (error) {
      if (mounted.current) setLoadError(formatStorageError(error));
    } finally {
      refreshing.current = false;
      if (mounted.current) setRefreshPending(false);
    }
  };

  useInput(
    (input, key) => {
      if (input === "q") { mounted.current = false; onQuit ? onQuit() : exit(); return; }
      if (key.escape) { mounted.current = false; onBack ? onBack() : exit(); return; }
      // Row actions require the selected row to be on screen.
      if (!loaded || refreshing.current || loadError || deleting.current || !viewport.visible) return;
      if (key.downArrow || input === "j") {
        setCursor((prev) => normalizePosition({ cursor: prev + 1, offset: 0 }, history.length, 1).cursor);
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
          setDeleteError(formatStorageError(error));
        }).finally(() => {
          deleting.current = false;
          if (mounted.current) setDeletePending(false);
        });
      } else if (key.return && history[cursor]) {
        setSelectedSession(new SearchSession(history[cursor]!.query, DEFAULT_TLDS));
      }
    },
    { isActive: !selectedSession && process.stdin.isTTY === true },
  );

  const hints = [
    ...(!refreshPending && !loadError ? [
      { key: "j/k", action: "move" },
      { key: "enter", action: "re-search" },
      { key: "d", action: "remove" },
    ] : []),
    ...(onBack ? [{ key: "esc", action: "back" }] : []),
    { key: "q", action: "quit" },
  ];

  if (!loaded) return null;

  if (selectedSession) {
    return <SearchView query={selectedSession.query} session={selectedSession}
      onBack={() => { void returnToHistory(selectedSession); }} onQuit={onQuit} />;
  }

  const notices = <>
    {saveError && <Text color={theme.yellow}>{saveError}</Text>}
    {loadError && <Text color={theme.red}>Could not refresh history: {loadError}. Reopen history after resolving the error.</Text>}
    {deleteError && <Text color={theme.red}>{deleteError}</Text>}
    {refreshPending && <Text color={theme.dim}>Refreshing history...</Text>}
  </>;

  if (history.length === 0) {
    return (
      <FrameBox fit title="Recent searches" hints={hints}>
        {notices}
        {!loadError && !refreshPending && <Text color={theme.dim}>No search history yet.</Text>}
      </FrameBox>
    );
  }

  return (
    <FrameBox fit title="Recent searches" hints={hints}>
      {notices}
      {deletePending && <Text color={theme.dim}>Deleting history entry...</Text>}
      {/* Table header */}
      <Box marginBottom={0} flexShrink={0}>
        <Text color={theme.dim}>{"DATE".padEnd(18)}{"QUERY".padEnd(16)}{"TLDs".padEnd(8)}{"RESULT"}</Text>
      </Box>

      {/* Rows */}
      <ListViewport viewport={viewport} cursor={cursor} rows={history.map((entry, i) => {
        const dateStr = formatHistoryTimestamp(entry.timestamp);
        const isSelected = i === cursor;

        return { key: `${entry.query}-${entry.timestamp}`, content: (
          <Box>
            <Box width={1} flexShrink={0}>{isSelected ? <Text color={theme.primary}>▸</Text> : <Text> </Text>}</Box>
            <Text color={theme.dim}>{dateStr.padEnd(18)}</Text>
            <Text color={theme.text}>{entry.query.padEnd(16)}</Text>
            <Text color={theme.lavender}>{String(entry.total).padEnd(8)}</Text>
            <Text color={theme.green}>{entry.available} avail</Text>
          </Box>
        ) };
      })} />

      <Box marginTop={1} flexShrink={0}>
        <Text color={theme.dim}>Total: {history.length} searches · ~/.temper/history.json</Text>
      </Box>
    </FrameBox>
  );
}
