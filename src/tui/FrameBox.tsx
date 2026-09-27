import { Box, Text, useWindowSize } from "ink";
import type { PropsWithChildren } from "react";
import { theme } from "./theme.ts";

interface Props {
  title?: string;
  hints?: { key: string; action: string }[];
  minHeight?: number;
  fit?: boolean;
}

export default function FrameBox({ title, hints, minHeight, fit = false, children }: PropsWithChildren<Props>) {
  const { rows, columns } = useWindowSize();
  if (fit && (rows < 12 || columns < 32)) return <Box height={Math.max(1, rows - 1)} overflow="hidden" flexDirection="column">
    <Text wrap="truncate-end">Enlarge terminal to view {title}</Text>
    <Text wrap="truncate-end">esc {hints?.some(h => h.key === "esc" && h.action === "back") ? "back" : "quit"} · q quit</Text>
  </Box>;
  return (
    <Box flexDirection="column" height={fit ? Math.max(1, rows - 1) : undefined} overflow={fit ? "hidden" : undefined}>
      {/* Main content area */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.border}
        borderBottom={hints && hints.length > 0 ? false : true}
        paddingX={1}
        paddingBottom={1}
        minHeight={minHeight}
        flexGrow={fit ? 1 : undefined}
        flexBasis={fit ? 0 : undefined}
        overflow={fit ? "hidden" : undefined}
      >
        {title && (
          <Box marginBottom={1} flexShrink={fit ? 0 : undefined}>
            <Text color={theme.primary} bold>{title}</Text>
          </Box>
        )}
        {children}
      </Box>

      {/* Footer with key hints */}
      {hints && hints.length > 0 && (
        <Box
          borderStyle="single"
          borderColor={theme.border}
          borderTop={false}
          paddingX={1}
          flexShrink={fit ? 0 : undefined}
        >
          <Text>{hints.map((hint, i) => (
            <Text key={`${hint.key}-${hint.action}`}>
              {i > 0 ? <Text color={theme.dim}> · </Text> : null}
              <Text color={theme.blue} bold>{hint.key}</Text>
              <Text color={theme.text}> {hint.action}</Text>
            </Text>
          ))}</Text>
        </Box>
      )}
    </Box>
  );
}
