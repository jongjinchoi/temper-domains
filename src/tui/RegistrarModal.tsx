import { Box, Text, useInput } from "ink";
import { type Registrar, REGISTRAR_META } from "../registrar/urls";
import KeyHints from "./KeyHints";
import { theme } from "./theme";

interface Props {
  domain: string;
  onSelect: (registrar: Registrar) => void;
  onCancel: () => void;
}

const HOTKEY_MAP: Record<string, Registrar> = {
  c: "cloudflare",
  p: "porkbun",
  n: "namecheap",
  v: "vercel",
};

export default function RegistrarModal({ domain, onSelect, onCancel }: Props) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    const registrar = HOTKEY_MAP[input];
    if (registrar) {
      onSelect(registrar);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.text}>Selected: </Text>
        <Text color={theme.green}>{domain}</Text>
        <Text color={theme.green}> ✓ available</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text color={theme.text} bold>
            Where to buy?
          </Text>
        </Box>

        {REGISTRAR_META.map((r) => (
          <Box key={r.key}>
            <Text color={theme.primary}>[{r.hotkey}]</Text>
            <Text> </Text>
            <Text color={theme.text}>{r.label.padEnd(12)}</Text>
            <Text color={theme.dim}>{r.description}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <KeyHints
          hints={[
            { key: "c/p/n/v", action: "select" },
            { key: "esc", action: "cancel" },
          ]}
        />
      </Box>
    </Box>
  );
}
