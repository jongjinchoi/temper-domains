import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_TLDS } from "../checker/types.ts";
import { addWatch } from "../config/watchlist.ts";
import { useSearchExecution } from "./hooks/useSearchExecution.ts";
import { openBrowser } from "../registrar/browser.ts";
import { type Registrar, buildURL } from "../registrar/urls.ts";
import FrameBox from "./FrameBox.tsx";
import ProgressBar from "./ProgressBar.tsx";
import RegistrarModal from "./RegistrarModal.tsx";
import ResultRow from "./ResultRow.tsx";
import Spinner from "./Spinner.tsx";
import WhoisView from "./WhoisView.tsx";
import { theme } from "./theme.ts";

type ScreenState = "searching" | "selecting" | "filtering" | "registrar" | "detail";

interface Props {
  query: string;
  tlds?: readonly string[];
  onlyAvailable?: boolean;
  timeoutMs?: number;
  onBack?: () => void;
  onNavigate?: (screen: string) => void;
  onQuit?: () => void;
}

const CHROME_LINES = 8;

export default function SearchView({ query, tlds = DEFAULT_TLDS, onlyAvailable = false, timeoutMs, onBack, onNavigate, onQuit }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termRows, setTermRows] = useState(stdout.rows ?? 40);
  const allDomains = useMemo(() => tlds.map((tld) => `${query}.${tld}`), [query, tlds]);

  useEffect(() => {
    const onResize = () => setTermRows(stdout.rows ?? 40);
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  const { results, count, elapsed, done } = useSearchExecution(query, tlds, timeoutMs);

  const [screenState, setScreenState] = useState<ScreenState>("searching");
  const [cursor, setCursor] = useState(0);
  const [viewOffset, setViewOffset] = useState(0);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const maxVisible = Math.max(5, termRows - CHROME_LINES);
  const visibleCount = Math.min(maxVisible, allDomains.length);

  useEffect(() => {
    if (done) setScreenState("selecting");
  }, [done]);

  useEffect(() => {
    if (cursor < viewOffset) {
      setViewOffset(cursor);
    } else if (cursor >= viewOffset + visibleCount) {
      setViewOffset(cursor - visibleCount + 1);
    }
  }, [cursor, viewOffset, visibleCount]);

  // Filter domains early so keyboard handler can reference it
  let displayDomains = onlyAvailable && screenState !== "searching"
    ? allDomains.filter((d) => results.get(d)?.status === "available")
    : allDomains;

  if (filterText) {
    displayDomains = displayDomains.filter((d) => d.includes(filterText));
  }

  useInput(
    (input, key) => {
      if (screenState === "registrar" || screenState === "detail") return;

      if (screenState === "filtering") {
        if (key.escape) {
          setFilterText("");
          setScreenState("selecting");
          setCursor(0);
        } else if (key.return) {
          setScreenState("selecting");
          setCursor(0);
        } else if (key.backspace || key.delete) {
          setFilterText((prev) => prev.slice(0, -1));
        } else if (input && !key.ctrl && !key.meta) {
          setFilterText((prev) => prev + input);
        }
        return;
      }

      if (input === "q") {
        onQuit ? onQuit() : exit();
        return;
      }
      if (key.escape) {
        onBack ? onBack() : (onQuit ? onQuit() : exit());
        return;
      }

      if (screenState === "selecting") {
        if (key.downArrow || input === "j") {
          setCursor((prev) => Math.min(prev + 1, displayDomains.length - 1));
        } else if (key.upArrow || input === "k") {
          setCursor((prev) => Math.max(prev - 1, 0));
        } else if (input === "/" ) {
          setScreenState("filtering");
          setFilterText("");
        } else if (input === "s" && onNavigate) {
          onNavigate("suggest");
        } else if (input === "h" && onNavigate) {
          onNavigate("history");
        } else if (input === "w" && onNavigate) {
          onNavigate("list");
        } else if (input === "a") {
          const domain = displayDomains[cursor];
          if (domain) {
            addWatch(domain).catch(() => {});
            setConfirmation(`✓ Added ${domain} to watchlist`);
            setTimeout(() => setConfirmation(null), 3000);
          }
        } else if (input === "i") {
          const domain = displayDomains[cursor];
          if (domain) {
            setScreenState("detail");
          }
        } else if (key.return) {
          const domain = displayDomains[cursor];
          if (domain) {
            const result = results.get(domain);
            if (result && result.status === "available") {
              setScreenState("registrar");
            }
          }
        }
      }
    },
    { isActive: screenState !== "registrar" && screenState !== "detail" && process.stdin.isTTY === true },
  );

  const handleRegistrarSelect = (registrar: Registrar) => {
    const domain = displayDomains[cursor];
    if (!domain) return;
    const url = buildURL(registrar, domain);
    openBrowser(url);
    setConfirmation(`✓ Opening ${registrar} for ${domain}...`);
    setScreenState("selecting");
    setTimeout(() => setConfirmation(null), 3000);
  };

  const handleRegistrarCancel = () => {
    setScreenState("selecting");
  };

  const total = allDomains.length;
  const elapsedSec = (elapsed / 1000).toFixed(1);

  const selectedDomain = displayDomains[cursor];

  const visibleDomains = displayDomains.slice(viewOffset, viewOffset + visibleCount);
  const hasMore = viewOffset + visibleCount < displayDomains.length;
  const hasLess = viewOffset > 0;

  const searchingHints = [
    { key: "ctrl+c", action: "cancel" },
    { key: "esc", action: "back" },
  ];
  const selectingHints = onNavigate
    ? [
        { key: "j/k", action: "move" },
        { key: "/", action: "filter" },
        { key: "enter", action: "buy" },
        { key: "i", action: "info" },
        { key: "a", action: "add" },
        { key: "s", action: "suggest" },
        { key: "h", action: "history" },
        { key: "w", action: "watchlist" },
        { key: "q", action: "quit" },
      ]
    : [
        { key: "j/k", action: "move" },
        { key: "/", action: "filter" },
        { key: "enter", action: "buy" },
        { key: "i", action: "info" },
        { key: "a", action: "add" },
        { key: "esc", action: "back" },
        { key: "q", action: "quit" },
      ];
  const filteringHints = [
    { key: "esc", action: "clear" },
    { key: "enter", action: "confirm" },
  ];
  const registrarHints = [
    { key: "c/p/n/v", action: "select" },
    { key: "esc", action: "cancel" },
  ];

  const detailHints = [
    { key: "esc", action: "back" },
    { key: "q", action: "quit" },
  ];
  const currentHints =
    screenState === "searching" ? searchingHints :
    screenState === "filtering" ? filteringHints :
    screenState === "registrar" ? registrarHints :
    screenState === "detail" ? detailHints :
    selectingHints;

  return (
    <FrameBox title={`temper search ${query}`} hints={currentHints}>
      {/* Header */}
      <Box marginBottom={1}>
        {screenState === "searching" ? (
          <Text>
            <Spinner />
            <Text color={theme.text}> Searching {total} TLDs...  </Text>
            <Text color={theme.lavender}>{count}/{total}</Text>
            <Text color={theme.dim}>  ({elapsedSec}s elapsed)</Text>
          </Text>
        ) : (
          <Text>
            <Text color={theme.green}>✓</Text>
            <Text color={theme.text}> Search complete  </Text>
            <Text color={theme.lavender}>{count}/{total}</Text>
            <Text color={theme.dim}>  ({elapsedSec}s)</Text>
          </Text>
        )}
      </Box>

      {/* Filter input */}
      {screenState === "filtering" && (
        <Box marginBottom={1}>
          <Text>
            <Text color={theme.blue} bold>/</Text>
            <Text color={theme.text}> Filter: </Text>
            <Text color={theme.lavender}>{filterText}</Text>
            <Text color={theme.primary}>█</Text>
          </Text>
        </Box>
      )}

      {/* Body */}
      {screenState === "detail" && selectedDomain ? (
        <WhoisView
          domain={selectedDomain}
          onBack={() => setScreenState("selecting")}
          onQuit={onQuit ?? (() => exit())}
        />
      ) : screenState === "registrar" && selectedDomain ? (
        <RegistrarModal
          domain={selectedDomain}
          onSelect={handleRegistrarSelect}
          onCancel={handleRegistrarCancel}
        />
      ) : (
        <Box flexDirection="column">
          {hasLess && <Text color={theme.dim}>  ↑ {viewOffset} more</Text>}
          {visibleDomains.map((domain) => {
            const i = displayDomains.indexOf(domain);
            return (
              <ResultRow
                key={domain}
                domain={domain}
                result={results.get(domain) ?? null}
                isSelected={screenState !== "searching" && i === cursor}
                showTime={screenState === "searching"}
              />
            );
          })}
          {hasMore && <Text color={theme.dim}>  ↓ {displayDomains.length - viewOffset - visibleCount} more</Text>}
        </Box>
      )}

      {/* Progress bar during search */}
      {screenState === "searching" && (
        <Box marginTop={1}>
          <ProgressBar current={count} total={total} />
        </Box>
      )}

      {/* Filter match count */}
      {screenState === "filtering" && (
        <Text color={theme.dim}>{displayDomains.length} of {allDomains.length} matches</Text>
      )}

      {/* Confirmation */}
      {confirmation && (
        <Box marginTop={1}>
          <Text color={theme.green}>{confirmation}</Text>
        </Box>
      )}
    </FrameBox>
  );
}
