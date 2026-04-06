import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import { saveConfig } from "../config/config";
import { REGISTRAR_META } from "../registrar/urls";
import { THEME_NAMES, setTheme, theme } from "./theme";

type Step = "registrar" | "theme" | "done";

const THEME_META = [
  { name: "temper-forge", icon: "🔥", label: "Temper Forge", desc: "Fire × Iron" },
  { name: "seoul-night", icon: "🌃", label: "Seoul Night", desc: "Neon × Han River" },
  { name: "catppuccin-mocha", icon: "🎨", label: "Catppuccin", desc: "Soft pastels" },
  { name: "dracula", icon: "🧛", label: "Dracula", desc: "High contrast" },
  { name: "default", icon: "⚫", label: "Default", desc: "Terminal native" },
];

export default function InitView() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("registrar");
  const [cursor, setCursor] = useState(0);
  const [selectedRegistrar, setSelectedRegistrar] = useState("");

  useInput(
    (input, key) => {
      if (step === "done") return;

      const items = step === "registrar" ? REGISTRAR_META : THEME_META;

      if (key.downArrow || input === "j") {
        setCursor((prev) => Math.min(prev + 1, items.length - 1));
      } else if (key.upArrow || input === "k") {
        setCursor((prev) => Math.max(prev - 1, 0));
      } else if (key.return) {
        if (step === "registrar") {
          setSelectedRegistrar(REGISTRAR_META[cursor].key);
          setCursor(0);
          setStep("theme");
        } else if (step === "theme") {
          const themeName = THEME_META[cursor].name;
          setTheme(themeName);
          saveConfig({ registrar: selectedRegistrar, theme: themeName }).then(() => {
            setStep("done");
            setTimeout(() => exit(), 1000);
          });
        }
      } else if (input === "q" || key.escape) {
        exit();
      }
    },
    { isActive: step !== "done" && process.stdin.isTTY === true },
  );

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text color={theme.primary} bold>
          Welcome to temper ⚒
        </Text>
      </Box>

      {step === "registrar" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={theme.text}>Select your preferred registrar:</Text>
          </Box>
          {REGISTRAR_META.map((r, i) => (
            <Box key={r.key}>
              <Text color={i === cursor ? theme.primary : theme.dim}>
                {i === cursor ? "▸" : " "}
              </Text>
              <Text color={i === cursor ? theme.text : theme.dim}>
                {" "}
                {r.label.padEnd(14)}
              </Text>
              <Text color={theme.dim}>{r.description}</Text>
            </Box>
          ))}
        </Box>
      )}

      {step === "theme" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={theme.text}>Select theme:</Text>
          </Box>
          {THEME_META.map((t, i) => (
            <Box key={t.name}>
              <Text color={i === cursor ? theme.primary : theme.dim}>
                {i === cursor ? "▸" : " "}
              </Text>
              <Text>
                {" "}
                {t.icon}{" "}
              </Text>
              <Text color={i === cursor ? theme.text : theme.dim}>
                {t.label.padEnd(16)}
              </Text>
              <Text color={theme.dim}>{t.desc}</Text>
            </Box>
          ))}
        </Box>
      )}

      {step === "done" && (
        <Box>
          <Text color={theme.green}>✓ Config saved to ~/.temper/config.json</Text>
        </Box>
      )}

      {step !== "done" && (
        <Box marginTop={1}>
          <Text color={theme.dim}>j/k move · enter select · q quit</Text>
        </Box>
      )}
    </Box>
  );
}
