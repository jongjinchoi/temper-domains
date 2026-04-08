import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import type { DomainDetail } from "../checker/types.ts";
import FrameBox from "./FrameBox.tsx";
import Spinner from "./Spinner.tsx";
import { getStatusStyle, theme } from "./theme.ts";

interface Props {
  domain: string;
  timeoutMs?: number;
  onBack?: () => void;
  onQuit?: () => void;
}

export default function WhoisView({ domain, timeoutMs, onBack, onQuit }: Props) {
  const { exit } = useApp();
  const [detail, setDetail] = useState<DomainDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    setDetail(null);
    setElapsed(0);

    const startTime = performance.now();
    const timer = setInterval(() => {
      if (!cancelledRef.current) setElapsed(Math.round(performance.now() - startTime));
    }, 100);

    (async () => {
      const { domainDetail } = await import("../checker/detail.ts");
      const result = await domainDetail(domain, { timeoutMs });
      if (!cancelledRef.current) {
        setDetail(result);
        setLoading(false);
        clearInterval(timer);
        setElapsed(Math.round(performance.now() - startTime));
      }
    })();

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [domain, timeoutMs]);

  useInput(
    (input, key) => {
      if (input === "q") { onQuit ? onQuit() : exit(); return; }
      if (key.escape) { onBack ? onBack() : exit(); return; }
    },
    { isActive: process.stdin.isTTY === true },
  );

  const hints = onBack
    ? [{ key: "esc", action: "back" }, { key: "q", action: "quit" }]
    : [{ key: "q", action: "quit" }];

  if (loading) {
    return (
      <FrameBox title={`whois ${domain}`} hints={hints}>
        <Text>
          <Spinner />
          <Text color={theme.text}> Looking up {domain}...  </Text>
          <Text color={theme.dim}>({(elapsed / 1000).toFixed(1)}s)</Text>
        </Text>
      </FrameBox>
    );
  }

  if (!detail) return null;

  const { icon, color } = getStatusStyle(detail.status);

  const formatDate = (iso: string | undefined) => {
    if (!iso) return undefined;
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toISOString().slice(0, 10);
    } catch { return iso; }
  };

  const formatExpiry = (iso: string | undefined) => {
    const date = formatDate(iso);
    if (!date || !iso) return undefined;
    try {
      const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days > 0) return `${date}  (in ${days} days)`;
      if (days === 0) return `${date}  (today)`;
      return `${date}  (${Math.abs(days)} days ago)`;
    } catch { return date; }
  };

  const row = (label: string, value: string | undefined) =>
    value ? (
      <Box key={label}>
        <Text color={theme.dim}>{label.padEnd(16)}</Text>
        <Text color={theme.text}>{value}</Text>
      </Box>
    ) : null;

  return (
    <FrameBox title={`whois ${domain}`} hints={hints}>
      {/* Status */}
      <Box marginBottom={1}>
        <Text color={color}>{icon} {detail.status}</Text>
        <Text color={theme.dim}>  via {detail.method}  ({detail.responseTime}ms)</Text>
      </Box>

      {/* Detail fields */}
      {detail.status === "taken" && (
        <Box flexDirection="column">
          {row("Registrar", detail.registrar)}
          {row("Registrant", detail.registrant)}
          {row("Created", formatDate(detail.createdDate))}
          {row("Updated", formatDate(detail.updatedDate))}
          {row("Expires", formatExpiry(detail.expiryDate))}
          {row("DNSSEC", detail.dnssec != null ? (detail.dnssec ? "signed" : "unsigned") : undefined)}
          {detail.nameServers && detail.nameServers.length > 0 && (
            <Box>
              <Text color={theme.dim}>{"Name Servers".padEnd(16)}</Text>
              <Box flexDirection="column">
                {detail.nameServers.map(ns => (
                  <Text key={ns} color={theme.text}>{ns}</Text>
                ))}
              </Box>
            </Box>
          )}
          {detail.statusCodes && detail.statusCodes.length > 0 && (
            <Box marginTop={1}>
              <Text color={theme.dim}>{"Status Codes".padEnd(16)}</Text>
              <Box flexDirection="column">
                {detail.statusCodes.map(code => (
                  <Text key={code} color={theme.text}>{code}</Text>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Available */}
      {detail.status === "available" && (
        <Text color={theme.green}>This domain is available for registration.</Text>
      )}

      {/* Error */}
      {detail.error && (
        <Box marginTop={1}>
          <Text color={theme.red}>Error: {detail.error}</Text>
        </Box>
      )}
    </FrameBox>
  );
}
