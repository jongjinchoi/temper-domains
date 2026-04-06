import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkDomains } from "../checker/checker";
import type { DomainResult } from "../checker/types";
import { DEFAULT_TLDS } from "../checker/types";
import { addHistory } from "../config/history";
import { openBrowser } from "../registrar/browser";
import { type Registrar, buildURL } from "../registrar/urls";
import KeyHints from "./KeyHints";
import RegistrarModal from "./RegistrarModal";
import ResultRow from "./ResultRow";
import Spinner from "./Spinner";
import { theme } from "./theme";

type ScreenState = "searching" | "selecting" | "registrar";

interface Props {
  query: string;
  tlds?: readonly string[];
}

// header(1) + marginBottom(1) + footer(1) + marginTop(1) + border top/bottom(2)
const CHROME_LINES = 6;

export default function SearchView({ query, tlds = DEFAULT_TLDS }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termRows, setTermRows] = useState(stdout.rows ?? 40);
  const allDomains = useMemo(() => tlds.map((tld) => `${query}.${tld}`), [query, tlds]);

  // Track terminal resize
  useEffect(() => {
    const onResize = () => setTermRows(stdout.rows ?? 40);
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  const [screenState, setScreenState] = useState<ScreenState>("searching");
  const [results, setResults] = useState<Map<string, DomainResult>>(new Map());
  const [cursor, setCursor] = useState(0);
  const [viewOffset, setViewOffset] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const maxVisible = Math.max(5, termRows - CHROME_LINES);
  const visibleCount = Math.min(maxVisible, allDomains.length);

  // Keep cursor within visible window
  useEffect(() => {
    if (cursor < viewOffset) {
      setViewOffset(cursor);
    } else if (cursor >= viewOffset + visibleCount) {
      setViewOffset(cursor - visibleCount + 1);
    }
  }, [cursor, viewOffset, visibleCount]);

  // Progressive rendering: stream results from checker
  useEffect(() => {
    const startTime = performance.now();
    const timer = setInterval(() => {
      setElapsed(Math.round(performance.now() - startTime));
    }, 100);

    (async () => {
      const collected: DomainResult[] = [];
      for await (const result of checkDomains(query, tlds)) {
        if (cancelledRef.current) break;
        collected.push(result);
        setResults((prev) => new Map(prev).set(result.domain, result));
      }
      clearInterval(timer);
      setElapsed(Math.round(performance.now() - startTime));
      if (!cancelledRef.current) {
        setScreenState("selecting");
        addHistory({
          query,
          timestamp: new Date().toISOString(),
          available: collected.filter((r) => r.status === "available").length,
          total: collected.length,
        });
      }
    })();

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [query, tlds]);

  // Keyboard handling
  useInput(
    (input, key) => {
      if (screenState === "registrar") return;

      if (input === "q" || key.escape) {
        exit();
        return;
      }

      if (screenState === "selecting") {
        if (key.downArrow || input === "j") {
          setCursor((prev) => Math.min(prev + 1, allDomains.length - 1));
        } else if (key.upArrow || input === "k") {
          setCursor((prev) => Math.max(prev - 1, 0));
        } else if (key.return) {
          const domain = allDomains[cursor];
          const result = results.get(domain);
          if (result && result.status === "available") {
            setScreenState("registrar");
          }
        }
      }
    },
    { isActive: screenState !== "registrar" && process.stdin.isTTY === true },
  );

  const handleRegistrarSelect = (registrar: Registrar) => {
    const domain = allDomains[cursor];
    const url = buildURL(registrar, domain);
    openBrowser(url);
    setConfirmation(`✓ Opening ${registrar} for ${domain}...`);
    setScreenState("selecting");

    setTimeout(() => {
      setConfirmation(null);
    }, 3000);
  };

  const handleRegistrarCancel = () => {
    setScreenState("selecting");
  };

  const count = results.size;
  const total = allDomains.length;
  const elapsedSec = (elapsed / 1000).toFixed(1);
  const selectedDomain = allDomains[cursor];

  // Visible slice of domains
  const visibleDomains = allDomains.slice(viewOffset, viewOffset + visibleCount);
  const hasMore = viewOffset + visibleCount < allDomains.length;
  const hasLess = viewOffset > 0;

  const searchingHints = [{ key: "q", action: "quit" }];
  const selectingHints = [
    { key: "j/k", action: "move" },
    { key: "enter", action: "buy" },
    { key: "q", action: "quit" },
  ];

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        {screenState === "searching" ? (
          <Text wrap="truncate-end">
            <Spinner />
            <Text color={theme.text}>
              {" "}
              Searching {total} TLDs...{" "}
            </Text>
            <Text color={theme.primary}>
              {count}/{total}
            </Text>
            <Text color={theme.dim}> ({elapsedSec}s)</Text>
          </Text>
        ) : (
          <Text wrap="truncate-end">
            <Text color={theme.green}>✓</Text>
            <Text color={theme.text}> Search complete </Text>
            <Text color={theme.primary}>
              {count}/{total}
            </Text>
            <Text color={theme.dim}> ({elapsedSec}s)</Text>
          </Text>
        )}
      </Box>

      {/* Body */}
      {screenState === "registrar" && selectedDomain ? (
        <RegistrarModal
          domain={selectedDomain}
          onSelect={handleRegistrarSelect}
          onCancel={handleRegistrarCancel}
        />
      ) : (
        <Box flexDirection="column">
          {hasLess && (
            <Text color={theme.dim}>  ↑ {viewOffset} more</Text>
          )}
          {visibleDomains.map((domain) => {
            const i = allDomains.indexOf(domain);
            return (
              <ResultRow
                key={domain}
                domain={domain}
                result={results.get(domain) ?? null}
                isSelected={screenState === "selecting" && i === cursor}
              />
            );
          })}
          {hasMore && (
            <Text color={theme.dim}>  ↓ {allDomains.length - viewOffset - visibleCount} more</Text>
          )}
        </Box>
      )}

      {/* Confirmation */}
      {confirmation && (
        <Box marginTop={1}>
          <Text color={theme.green}>{confirmation}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <KeyHints hints={screenState === "searching" ? searchingHints : selectingHints} />
      </Box>
    </Box>
  );
}
