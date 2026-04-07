import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { dnsCheck } from "../checker/dns.ts";
import { pLimit } from "../checker/limiter.ts";
import { DEFAULT_PREFIXES, DEFAULT_SUFFIXES } from "../checker/types.ts";
import type { DomainStatus } from "../checker/types.ts";
import FrameBox from "./FrameBox.tsx";
import SearchView from "./SearchView.tsx";
import Spinner from "./Spinner.tsx";
import { getStatusStyle, theme } from "./theme.ts";

const CHECK_TLD = "com";

interface Props {
  query: string;
  prefixes?: string[];
  suffixes?: string[];
  onBack?: () => void;
  onQuit?: () => void;
}

export default function SuggestView({ query, prefixes, suffixes, onBack, onQuit }: Props) {
  const { exit } = useApp();

  const pList = prefixes ?? DEFAULT_PREFIXES;
  const sList = suffixes ?? DEFAULT_SUFFIXES;

  const groups = useMemo(() => {
    const base = [query];
    const prefix = pList.map((p) => `${p}${query}`);
    const suffix = sList.map((s) => `${query}${s}`);
    return { base, prefix, suffix };
  }, [query, pList, sList]);

  const allNames = useMemo(
    () => [...groups.base, ...groups.prefix, ...groups.suffix],
    [groups],
  );

  const [results, setResults] = useState<Map<string, DomainStatus>>(new Map());
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    const startTime = performance.now();
    const timer = setInterval(() => {
      setElapsed(Math.round(performance.now() - startTime));
    }, 100);

    const limit = pLimit(30);

    (async () => {
      const tasks = allNames.map((name) =>
        limit(async () => {
          const domain = `${name}.${CHECK_TLD}`;
          const status = await dnsCheck(domain);
          setResults((prev) => new Map(prev).set(name, status));
        }),
      );

      await Promise.allSettled(tasks);
      clearInterval(timer);
      setElapsed(Math.round(performance.now() - startTime));
      setDone(true);
    })();

    return () => clearInterval(timer);
  }, [allNames]);

  useInput(
    (input, key) => {
      if (input === "q") { onQuit ? onQuit() : exit(); return; }
      if (key.escape) { onBack ? onBack() : exit(); return; }
      if (key.downArrow || input === "j") {
        setCursor((prev) => Math.min(prev + 1, allNames.length - 1));
      } else if (key.upArrow || input === "k") {
        setCursor((prev) => Math.max(prev - 1, 0));
      } else if (key.return && done && allNames[cursor]) {
        setSelectedName(allNames[cursor]!);
      }
    },
    { isActive: process.stdin.isTTY === true },
  );

  const elapsedSec = (elapsed / 1000).toFixed(1);
  const available = [...results.values()].filter((s) => s === "available").length;
  const taken = [...results.values()].filter((s) => s === "taken").length;

  const hints = onBack
    ? [
        { key: "j/k", action: "move" },
        { key: "enter", action: "check all TLDs" },
        { key: "esc", action: "back" },
        { key: "q", action: "quit" },
      ]
    : [
        { key: "j/k", action: "move" },
        { key: "enter", action: "check all TLDs" },
        { key: "q", action: "quit" },
      ];

  const renderGroup = (label: string, names: string[], offset: number) => (
    <Box flexDirection="column" key={label} marginTop={1}>
      <Box>
        <Text color={theme.lavender} bold>{label}</Text>
      </Box>
      {names.map((name, i) => {
        const globalIdx = offset + i;
        const status = results.get(name);
        const isSelected = globalIdx === cursor;
        const style = status ? getStatusStyle(status) : null;

        return (
          <Box key={name}>
            {isSelected ? <Text color={theme.primary}>▸ </Text> : <Text>  </Text>}
            <Text color={theme.text}>{name.padEnd(20)}</Text>
            {status == null ? (
              <Text color={theme.dim}>… checking</Text>
            ) : (
              <Text color={style!.color}>{style!.icon} {status}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );

  if (selectedName) {
    return <SearchView query={selectedName} onBack={() => setSelectedName(null)} />;
  }

  return (
    <FrameBox title={`Suggestions for "${query}"`} hints={hints}>
      {/* Header */}
      <Box marginBottom={1}>
        {!done ? (
          <Text>
            <Spinner />
            <Text color={theme.text}> Checking {allNames.length} names...  </Text>
            <Text color={theme.lavender}>{results.size}/{allNames.length}</Text>
            <Text color={theme.dim}>  ({elapsedSec}s)</Text>
          </Text>
        ) : (
          <Text>
            <Text color={theme.green}>✓</Text>
            <Text color={theme.text}> {allNames.length} names checked</Text>
            <Text color={theme.dim}>  ({elapsedSec}s)</Text>
          </Text>
        )}
      </Box>

      {/* Groups */}
      {renderGroup("BASE", groups.base, 0)}
      {renderGroup("PREFIX", groups.prefix, groups.base.length)}
      {renderGroup("SUFFIX", groups.suffix, groups.base.length + groups.prefix.length)}

      {/* Summary */}
      {done && (
        <Text>
          <Text color={theme.dim}>Summary: </Text>
          <Text color={theme.green}>{available} available</Text>
          <Text color={theme.dim}> · </Text>
          <Text color={theme.red}>{taken} taken</Text>
        </Text>
      )}
    </FrameBox>
  );
}
