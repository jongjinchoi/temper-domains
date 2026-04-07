import { Box, Text } from "ink";
import { theme } from "./theme.ts";

interface Hint {
  key: string;
  action: string;
}

export default function KeyHints({ hints }: { hints: Hint[] }) {
  return (
    <Box>
      {hints.map((hint, i) => (
        <Text key={`${hint.key}-${hint.action}`}>
          {i > 0 ? <Text color={theme.dim}> · </Text> : null}
          <Text color={theme.primary}>{hint.key}</Text>
          <Text color={theme.dim}> {hint.action}</Text>
        </Text>
      ))}
    </Box>
  );
}
