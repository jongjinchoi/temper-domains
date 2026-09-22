import { Box } from "ink";
import type { ReactNode } from "react";
import { theme } from "./theme.ts";

export function TerminalPanel({ children }: { children: ReactNode }) {
  return <Box borderStyle="round" borderColor={theme.border} paddingX={1} flexDirection="column" width="100%">
    {children}
  </Box>;
}
