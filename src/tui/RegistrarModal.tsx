import { Box, Text, useInput } from "ink";
import { type Registrar, REGISTRAR_META } from "../registrar/urls.ts";
import { theme } from "./theme.ts";

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

const BRAND_COLORS: Record<string, string> = {
  cloudflare: "peach",
  porkbun: "maroon",
  namecheap: "red",
  vercel: "text",
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
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.dim}>Selected:  </Text>
        <Text color={theme.green}>{domain}</Text>
        <Text color={theme.green}>  ✓ available</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text color={theme.text} bold>Where to buy?</Text>
        </Box>

        {REGISTRAR_META.map((r) => {
          const brandColorKey = BRAND_COLORS[r.key] ?? "text";
          const brandColor = theme[brandColorKey as keyof typeof theme] ?? theme.text;
          return (
            <Box key={r.key}>
              <Text color={theme.blue} bold>[{r.hotkey}]</Text>
              <Text> </Text>
              <Text color={brandColor}>{r.label.padEnd(14)}</Text>
              <Text color={theme.dim}>{r.description}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
