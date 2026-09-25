import { lookupNoticeLines } from "../utils/lookup-notice.ts";
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
import { canResume, isAnswered } from "../checker/retry.ts";
import { RESUME_BUDGET_MS, type SearchSession } from "./search-session.ts";

type ScreenState = "searching" | "failed" | "selecting" | "filtering" | "registrar" | "detail" | "resume";

interface Props {
  query: string;
  tlds?: readonly string[];
  onlyAvailable?: boolean;
  timeoutMs?: number;
  session?: SearchSession;
  onBack?: () => void;
  onNavigate?: (screen: string) => void;
  onQuit?: () => void;
}

function hintsFor(state: ScreenState, navigate: boolean, resuming: boolean) {
  if (state === "resume") return [{ key: "enter", action: "resume once" }, { key: "esc", action: "cancel" }];
  if (state === "searching") return [{ key: "ctrl+c", action: "cancel" }, { key: "esc", action: resuming ? "stop resume" : "back" }];
  if (state === "filtering") return [{ key: "esc", action: "clear" }, { key: "enter", action: "confirm" }];
  if (state === "registrar") return [{ key: "c/p/n/v", action: "select" }, { key: "esc", action: "cancel" }];
  if (state === "detail") return [{ key: "esc", action: "back" }, { key: "q", action: "quit" }];
  return [
    { key: "j/k", action: "move" }, { key: "/", action: "filter" },
    { key: "r/R", action: "resume" }, { key: "u", action: "unresolved" },
    { key: "enter", action: "registrar" }, { key: "i", action: "info" }, { key: "a", action: "add" },
    ...(navigate ? [{ key: "s", action: "suggest" }, { key: "h", action: "history" }, { key: "w", action: "watchlist" }] : [{ key: "esc", action: "back" }]),
    { key: "q", action: "quit" },
  ];
}

// These labels use ASCII and single-column separators. Reserve their wrapped
// lines before choosing the list viewport, including resume confirmation.
function wrappedLines(text: string, width: number): number {
  let lines = 1, used = 0;
  for (const word of text.split(/\s+/)) {
    if (used && used + 1 + word.length > width) { lines++; used = 0; }
    if (used) used++;
    used += word.length;
    while (used > width) { lines++; used -= width; }
  }
  return lines;
}

type Position = { cursor: number; offset: number };

function normalizePosition(position: Position, count: number, capacity: number): Position {
  if (count === 0) return { cursor: 0, offset: 0 };
  const size = Math.min(capacity, count);
  const cursor = Math.max(0, Math.min(position.cursor, count - 1));
  let offset = Math.max(0, Math.min(position.offset, count - size));
  if (cursor < offset) offset = cursor;
  if (cursor >= offset + size) offset = cursor - size + 1;
  return { cursor, offset };
}

export default function SearchView({ query, tlds = DEFAULT_TLDS, onlyAvailable = false, timeoutMs, session: owner, onBack, onNavigate, onQuit }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termRows, setTermRows] = useState(stdout.rows ?? 40);
  const [termColumns, setTermColumns] = useState(stdout.columns ?? 80);
  const allDomains = useMemo(() => tlds.map((tld) => `${query}.${tld}`.toLowerCase()), [query, tlds]);

  useEffect(() => {
    const onResize = () => { setTermRows(stdout.rows ?? 40); setTermColumns(stdout.columns ?? 80); };
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  const { results, totalAttempts, count, roundTotal, resuming, elapsed, done, error, historyError, session } = useSearchExecution(query, tlds, timeoutMs, owner);

  const [screenState, setScreenState] = useState<ScreenState>("searching");
  const [position, setPosition] = useState<Position>({ cursor: 0, offset: 0 });
  const [confirmation, setConfirmation] = useState<{ text: string; error?: boolean } | null>(null);
  const [filterText, setFilterText] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [resumeDomains, setResumeDomains] = useState<string[]>([]);
  const resumeWaits = resumeDomains.map(domain => Date.parse(results.get(domain)?.retryAt ?? "") - Date.now());
  const hasLimits = [...results.values()].some(result => result.retryAt);
  const currentHints = hintsFor(screenState, !!onNavigate, resuming);
  const contentWidth = Math.max(1, termColumns - 4);
  const footerLines = wrappedLines(currentHints.map(hint => `${hint.key} ${hint.action}`).join(" · "), contentWidth);
  const extraLines = (hasLimits ? 2 : 0) + (historyError ? 1 : 0)
    + (confirmation ? 1 + wrappedLines(confirmation.text, contentWidth) : 0)
    + (screenState === "resume" ? 3 : screenState === "filtering" ? 3 : screenState === "searching" ? 1 : 0);
  const capacity = termRows - 8 - footerLines - extraLines;

  useEffect(() => {
    setScreenState(done ? (error ? "failed" : "selecting") : "searching");
  }, [done, error]);

  // Filter domains early so keyboard handler can reference it
  let displayDomains = unresolvedOnly ? allDomains.filter(d => !results.has(d) || !isAnswered(results.get(d)!)) : onlyAvailable && screenState !== "searching"
    ? allDomains.filter((d) => results.get(d)?.status === "available")
    : allDomains;

  if (filterText) {
    displayDomains = displayDomains.filter((d) => d.includes(filterText));
  }
  if (error) displayDomains = displayDomains.filter((domain) => results.has(domain));
  const maxVisible = Math.max(1, capacity - (displayDomains.length > capacity ? 2 : 0));
  const { cursor, offset: viewOffset } = normalizePosition(position, displayDomains.length, maxVisible);
  const visibleCount = Math.min(maxVisible, displayDomains.length);
  const selectedDomain = displayDomains[cursor];

  const move = (delta: number) => setPosition(previous => {
    const current = normalizePosition(previous, displayDomains.length, maxVisible);
    return normalizePosition({ ...current, cursor: current.cursor + delta }, displayDomains.length, maxVisible);
  });

  useInput(
    (input, key) => {
      if (screenState === "registrar" || screenState === "detail") return;

      if (screenState === "filtering") {
        if (key.escape) {
          setFilterText("");
          setScreenState("selecting");
          setPosition({ cursor: 0, offset: 0 });
        } else if (key.return) {
          setScreenState("selecting");
          setPosition({ cursor: 0, offset: 0 });
        } else if (key.backspace || key.delete) {
          setFilterText((prev) => prev.slice(0, -1));
          setPosition({ cursor: 0, offset: 0 });
        } else if (input && !key.ctrl && !key.meta) {
          setFilterText((prev) => prev + input);
          setPosition({ cursor: 0, offset: 0 });
        }
        return;
      }

      if (input === "q") {
        onQuit ? onQuit() : exit();
        return;
      }
      if (screenState === "resume") {
        if (key.escape) setScreenState("selecting");
        else if (key.return) {
          try {
            const run = session.resume(resumeDomains);
            setScreenState("searching");
            void run.then(() => { if (session.getSnapshot().done) setScreenState(session.getSnapshot().error ? "failed" : "selecting"); });
          }
          catch (error) { setConfirmation({ text: String(error instanceof Error ? error.message : error), error: true }); setScreenState("selecting"); }
        }
        return;
      }
      if (key.escape) {
        if (!done && resuming) { session.cancel(); return; }
        onBack ? onBack() : (onQuit ? onQuit() : exit());
        return;
      }

      if (screenState === "selecting" || screenState === "failed") {
        if (key.downArrow || input === "j") {
          move(1);
        } else if (key.upArrow || input === "k") {
          move(-1);
        } else if (input === "r" || input === "R") {
          const candidates = (input === "r" ? selectedDomain ? [selectedDomain] : [] : displayDomains)
            .filter(domain => results.has(domain) && canResume(results.get(domain)!));
          if (candidates.length) { setResumeDomains(candidates); setScreenState("resume"); }
          else setConfirmation({ text: "No resumable candidates in this selection. Use u to show unresolved results." });
        } else if (input === "u") {
          setUnresolvedOnly(value => !value); setPosition({ cursor: 0, offset: 0 });
        } else if (input === "/" ) {
          setScreenState("filtering");
          setFilterText("");
          setPosition({ cursor: 0, offset: 0 });
        } else if (input === "s" && onNavigate) {
          onNavigate("suggest");
        } else if (input === "h" && onNavigate) {
          onNavigate("history");
        } else if (input === "w" && onNavigate) {
          onNavigate("list");
        } else if (input === "a") {
          const domain = selectedDomain;
          if (domain) {
            addWatch(domain).then(
              () => {
                setConfirmation({ text: `✓ Added ${domain} to watchlist` });
                setTimeout(() => setConfirmation(null), 3000);
              },
              (err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                setConfirmation({ text: `✗ Failed to add ${domain}: ${msg}`, error: true });
                setTimeout(() => setConfirmation(null), 5000);
              },
            );
          }
        } else if (input === "i") {
          const domain = selectedDomain;
          if (domain) {
            setScreenState("detail");
          }
        } else if (key.return) {
          const domain = selectedDomain;
          if (domain) {
            const result = results.get(domain);
            if (result && (result.status === "available" || !isAnswered(result))) {
              setScreenState("registrar");
            }
          }
        }
      }
    },
    { isActive: screenState !== "registrar" && screenState !== "detail" && process.stdin.isTTY === true },
  );

  const handleRegistrarSelect = (registrar: Registrar) => {
    const domain = selectedDomain;
    if (!domain) return;
    const url = buildURL(registrar, domain);
    openBrowser(url);
    setConfirmation({ text: `✓ Opening ${registrar} for ${domain}...` });
    setScreenState("selecting");
    setTimeout(() => setConfirmation(null), 3000);
  };

  const handleRegistrarCancel = () => {
    setScreenState("selecting");
  };

  const total = allDomains.length;
  const answered = [...results.values()].filter(result => ["available", "taken", "premium", "reserved"].includes(result.status)).length;
  const unresolved = total - answered;
  const elapsedSec = (elapsed / 1000).toFixed(1);

  const visibleDomains = displayDomains.slice(viewOffset, viewOffset + visibleCount);
  const hasMore = viewOffset + visibleCount < displayDomains.length;
  const hasLess = viewOffset > 0;

  return (
    <FrameBox title={`temper search ${query}`} hints={currentHints}>
      {/* Header */}
      <Box marginBottom={1}>
        {error && screenState !== "resume" ? (
          <Text color={theme.red}>Search failed: {error}</Text>
        ) : screenState === "searching" ? (
          <Text>
            <Spinner />
            <Text color={theme.text}> {resuming ? "Resuming" : "Searching"} {roundTotal} {resuming ? "candidates" : "TLDs"}...  </Text>
            <Text color={theme.lavender}>{count}/{roundTotal}</Text>
            <Text color={theme.dim}>  ({elapsedSec}s elapsed)</Text>
          </Text>
        ) : (
          <Text>
            <Text color={unresolved ? theme.yellow : theme.green}>{unresolved ? "⚠" : "✓"}</Text>
            <Text color={theme.text}> {unresolved ? "Partial results" : "Search complete"}  </Text>
            <Text color={theme.lavender}>{answered}/{total} answered</Text>
            <Text color={theme.dim}>  ({elapsedSec}s)</Text>
          </Text>
        )}
      </Box>

      {done && !error && <Text color={theme.dim}>Confirm purchase availability and pricing with a registrar.</Text>}
      {historyError && <Text color={theme.yellow}>History was not saved: {historyError}</Text>}
      {screenState === "resume" && <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.yellow}>Resume {resumeDomains.length} unresolved candidate{resumeDomains.length === 1 ? "" : "s"} once? Maximum {RESUME_BUDGET_MS / 1000}s.</Text>
        <Text color={theme.dim}>Waiting: {resumeWaits.filter(wait => wait > 0).length}; beyond budget: {resumeWaits.filter(wait => wait >= RESUME_BUDGET_MS).length}. Existing answers stay; server waits apply.</Text>
      </Box>}

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
          needsConfirmation={results.get(selectedDomain)?.status !== "available" || results.get(selectedDomain)?.confidence === "low"}
          onSelect={handleRegistrarSelect}
          onCancel={handleRegistrarCancel}
        />
      ) : (
        <Box flexDirection="column">
          {hasLess && <Text color={theme.dim}>  ↑ {viewOffset} more</Text>}
          {visibleDomains.map((domain, idx) => {
            const i = viewOffset + idx;
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

      {hasLimits && screenState !== "detail" && screenState !== "registrar" && selectedDomain &&
        lookupNoticeLines(results.get(selectedDomain) ?? {}, true).map((line, index) =>
          <Text key={index} color={theme.yellow} wrap="truncate-end">{line}{index === 1 ? `; session attempts: ${totalAttempts.get(selectedDomain) ?? 0}` : ""}</Text>)}

      {/* Progress bar during search */}
      {screenState === "searching" && (
        <Box marginTop={1}>
          <ProgressBar current={count} total={roundTotal} />
        </Box>
      )}

      {/* Filter match count */}
      {screenState === "filtering" && (
        <Text color={theme.dim}>{displayDomains.length} of {allDomains.length} matches</Text>
      )}

      {/* Confirmation */}
      {confirmation && (
        <Box marginTop={1}>
          <Text color={confirmation.error ? theme.red : theme.green}>{confirmation.text}</Text>
        </Box>
      )}
    </FrameBox>
  );
}
