import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { ConfigSaveError, saveConfig } from "../config/config.ts";
import { REGISTRAR_META } from "../registrar/urls.ts";
import FrameBox from "./FrameBox.tsx";
import { setTheme, theme } from "./theme.ts";

type Step = "registrar" | "theme" | "done";

const STEP_LABELS: Record<Step, { num: number; desc: string }> = {
  registrar: { num: 1, desc: "Choose your preferred registrar" },
  theme: { num: 2, desc: "Choose a theme" },
  done: { num: 3, desc: "Setup complete" },
};

const THEME_META = [
  { name: "temper-forge", label: "Temper Forge", desc: "Fire × Iron" },
  { name: "seoul-night", label: "Seoul Night", desc: "Neon × Han River" },
  { name: "catppuccin-mocha", label: "Catppuccin", desc: "Soft pastels" },
  { name: "dracula", label: "Dracula", desc: "High contrast" },
  { name: "default", label: "Default", desc: "Classic terminal colors" },
  { name: "catppuccin-latte", label: "Catppuccin Latte", desc: "Pastel light" },
  { name: "rose-pine-dawn", label: "Rosé Pine Dawn", desc: "Warm natural light" },
];

interface Props {
  currentConfig?: { registrar: string; theme: string };
}

export default function InitView({ currentConfig }: Props) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("registrar");

  const initialRegistrarIdx = currentConfig
    ? Math.max(0, REGISTRAR_META.findIndex((r) => r.key === currentConfig.registrar))
    : 0;
  const initialThemeIdx = currentConfig
    ? Math.max(0, THEME_META.findIndex((t) => t.name === currentConfig.theme))
    : 0;

  const [cursor, setCursor] = useState(initialRegistrarIdx);
  const [selectedRegistrar, setSelectedRegistrar] = useState(currentConfig?.registrar ?? "");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(exitTimer.current);
    };
  }, []);

  useInput(
    (input, key) => {
      if (input === "q" || key.escape) {
        mounted.current = false;
        clearTimeout(exitTimer.current);
        exit();
        return;
      }
      if (step === "done" || saving.current) return;

      const items = step === "registrar" ? REGISTRAR_META : THEME_META;

      if (key.downArrow || input === "j") {
        setCursor((prev) => Math.min(prev + 1, items.length - 1));
      } else if (key.upArrow || input === "k") {
        setCursor((prev) => Math.max(prev - 1, 0));
      } else if (key.return) {
        if (step === "registrar") {
          setSelectedRegistrar(REGISTRAR_META[cursor]!.key);
          setCursor(initialThemeIdx);
          setStep("theme");
        } else if (step === "theme") {
          const themeName = THEME_META[cursor]!.name;
          const themeLabel = THEME_META[cursor]!.label;
          saving.current = true;
          setSavePending(true);
          setSaveError(null);
          setSelectedTheme(themeLabel);
          saveConfig({ registrar: selectedRegistrar, theme: themeName }).then(() => {
            if (!mounted.current) return;
            setTheme(themeName);
            setStep("done");
            exitTimer.current = setTimeout(() => {
              if (mounted.current) exit({ registrar: selectedRegistrar, theme: themeLabel });
            }, 2000);
          }).catch((error: unknown) => {
            if (!mounted.current) return;
            if (error instanceof ConfigSaveError && error.committed) {
              setTheme(themeName);
              setStep("done");
            }
            setSaveError(error instanceof Error ? error.message : String(error));
          }).finally(() => {
            saving.current = false;
            if (mounted.current) setSavePending(false);
          });
        }
      }
    },
    { isActive: process.stdin.isTTY === true },
  );

  const stepInfo = STEP_LABELS[step];
  const hints =
    step === "done"
      ? [{ key: "q", action: "quit" }]
      : savePending ? [{ key: "esc", action: "exit" }] : [
          { key: "j/k", action: "up/down" },
          { key: "enter", action: "next" },
          { key: "esc", action: "cancel" },
        ];

  return (
    <FrameBox title="Welcome to temper" hints={hints} minHeight={10}>
      <Box marginBottom={1}>
        <Text color={theme.lavender}>Step {stepInfo.num} of 3</Text>
        <Text color={theme.dim}>  ·  </Text>
        <Text color={theme.dim}>{stepInfo.desc}</Text>
      </Box>

      {savePending && <Text color={theme.dim}>Saving settings...</Text>}
      {saveError && <Text color={step === "done" ? theme.yellow : theme.red}>{saveError}</Text>}

      {step === "registrar" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={theme.text}>Select your preferred registrar</Text>
          </Box>
          {REGISTRAR_META.map((r, i) => (
            <Box key={r.key}>
              <Text color={i === cursor ? theme.primary : theme.dim}>
                {"  "}{i === cursor ? "●" : "○"}{" "}
              </Text>
              <Text color={i === cursor ? theme.text : theme.dim} bold={i === cursor}>
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
            <Text color={theme.text}>Select theme</Text>
          </Box>
          {THEME_META.map((t, i) => (
            <Box key={t.name}>
              <Text color={i === cursor ? theme.primary : theme.dim}>
                {"  "}{i === cursor ? "●" : "○"}{" "}
              </Text>
              <Text color={i === cursor ? theme.text : theme.dim} bold={i === cursor}>
                {t.label.padEnd(16)}
              </Text>
              <Text color={theme.dim}>{t.desc}</Text>
            </Box>
          ))}
        </Box>
      )}

      {step === "done" && (
        <Box flexDirection="column">
          <Text color={theme.green}>✓ Config saved to ~/.temper/config.json</Text>
          <Text>{""}</Text>
          <Text>
            <Text color={theme.dim}>  Registrar:  </Text>
            <Text color={theme.text}>{selectedRegistrar}</Text>
          </Text>
          <Text>
            <Text color={theme.dim}>  Theme:      </Text>
            <Text color={theme.text}>{selectedTheme}</Text>
          </Text>
          <Text>{""}</Text>
          <Text>
            <Text color={theme.dim}>  Try it:  </Text>
            <Text color={theme.text}>temper search {"<name>"}</Text>
          </Text>
          <Text>
            <Text color={theme.dim}>  Help:    </Text>
            <Text color={theme.text}>temper --help</Text>
          </Text>
        </Box>
      )}
    </FrameBox>
  );
}
