import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { dnsCheck } from "../checker/dns";
import { pLimit } from "../checker/limiter";
import type { DomainStatus } from "../checker/types";
import Spinner from "./Spinner";
import { getStatusStyle, theme } from "./theme";

const DEFAULT_PREFIXES = ["get", "use", "try", "my", "go", "join"];
const DEFAULT_SUFFIXES = ["app", "labs", "hq", "ly", "dev", "hub", "run", "kit"];
const SUGGEST_TLDS = ["com", "dev", "io", "app", "ai"];

interface Props {
  query: string;
  prefixes?: string[];
  suffixes?: string[];
}

type ResultKey = string;
function makeKey(name: string, tld: string): ResultKey {
  return `${name}:${tld}`;
}

export default function SuggestView({ query, prefixes, suffixes }: Props) {
  const { exit } = useApp();

  const pList = prefixes ?? DEFAULT_PREFIXES;
  const sList = suffixes ?? DEFAULT_SUFFIXES;

  const combinations = useMemo(() => {
    const names = [query];
    for (const p of pList) names.push(`${p}${query}`);
    for (const s of sList) names.push(`${query}${s}`);
    return names;
  }, [query, pList, sList]);

  const [results, setResults] = useState<Map<ResultKey, DomainStatus>>(new Map());
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const totalQueries = combinations.length * SUGGEST_TLDS.length;

  useEffect(() => {
    const startTime = performance.now();
    const timer = setInterval(() => {
      setElapsed(Math.round(performance.now() - startTime));
    }, 100);

    const limit = pLimit(30);

    (async () => {
      const tasks = combinations.flatMap((name) =>
        SUGGEST_TLDS.map((tld) =>
          limit(async () => {
            const domain = `${name}.${tld}`;
            const status = await dnsCheck(domain);
            setResults((prev) => new Map(prev).set(makeKey(name, tld), status));
          }),
        ),
      );

      await Promise.allSettled(tasks);
      clearInterval(timer);
      setElapsed(Math.round(performance.now() - startTime));
      setDone(true);
    })();

    return () => clearInterval(timer);
  }, [combinations]);

  useInput(
    (input, key) => {
      if (input === "q" || key.escape) exit();
    },
    { isActive: process.stdin.isTTY === true },
  );

  const elapsedSec = (elapsed / 1000).toFixed(1);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        {!done ? (
          <Text wrap="truncate-end">
            <Spinner />
            <Text color={theme.text}>
              {" "}
              Checking {combinations.length} names × {SUGGEST_TLDS.length} TLDs...{" "}
            </Text>
            <Text color={theme.primary}>
              {results.size}/{totalQueries}
            </Text>
            <Text color={theme.dim}> ({elapsedSec}s)</Text>
          </Text>
        ) : (
          <Text wrap="truncate-end">
            <Text color={theme.green}>✓</Text>
            <Text color={theme.text}>
              {" "}
              {combinations.length} names checked
            </Text>
            <Text color={theme.dim}> ({elapsedSec}s)</Text>
          </Text>
        )}
      </Box>

      {/* Table header */}
      <Box>
        <Text color={theme.dim}>{"  "}{("name").padEnd(20)}</Text>
        {SUGGEST_TLDS.map((tld) => (
          <Box key={tld} width={8}>
            <Text color={theme.dim}>.{tld}</Text>
          </Box>
        ))}
      </Box>

      {/* Table rows */}
      {combinations.map((name) => (
        <Box key={name}>
          <Text color={theme.text}>{"  "}{name.padEnd(20)}</Text>
          {SUGGEST_TLDS.map((tld) => {
            const status = results.get(makeKey(name, tld));
            if (status == null) {
              return (
                <Box key={tld} width={8}>
                  <Text color={theme.dim}>…</Text>
                </Box>
              );
            }
            const { icon, color } = getStatusStyle(status);
            return (
              <Box key={tld} width={8}>
                <Text color={color}>{icon}</Text>
              </Box>
            );
          })}
        </Box>
      ))}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color={theme.dim}>q quit</Text>
      </Box>
    </Box>
  );
}
