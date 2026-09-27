import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { saveConfig } from "../config/config.ts";
import { FileTransactionError, formatStorageError } from "../utils/storage-error.ts";
import FrameBox from "./FrameBox.tsx";
import { setTheme, theme } from "./theme.ts";
import { THEME_META } from "./theme-meta.ts";

type Step = "theme" | "done";

const STEP_LABELS: Record<Step, { num: number; desc: string }> = {
  theme: { num: 1, desc: "Choose a theme" },
  done: { num: 2, desc: "Setup complete" },
};

interface Props {
  currentConfig?: { theme: string };
}

export default function InitView({ currentConfig }: Props) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("theme");

  const initialThemeIdx = currentConfig
    ? Math.max(0, THEME_META.findIndex((t) => t.key === currentConfig.theme))
    : 0;

  const [cursor, setCursor] = useState(initialThemeIdx);
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

      if (key.downArrow || input === "j") {
        setCursor((prev) => Math.min(prev + 1, THEME_META.length - 1));
      } else if (key.upArrow || input === "k") {
        setCursor((prev) => Math.max(prev - 1, 0));
      } else if (key.return) {
        if (step === "theme") {
          const themeName = THEME_META[cursor]!.key;
          const themeLabel = THEME_META[cursor]!.label;
          saving.current = true;
          setSavePending(true);
          setSaveError(null);
          setSelectedTheme(themeLabel);
          saveConfig({ theme: themeName }).then(() => {
            if (!mounted.current) return;
            setTheme(themeName);
            setStep("done");
            exitTimer.current = setTimeout(() => {
              if (mounted.current) exit({ theme: themeLabel });
            }, 2000);
          }).catch((error: unknown) => {
            if (!mounted.current) return;
            if (error instanceof FileTransactionError && error.committed) {
              setTheme(themeName);
              setStep("done");
            }
            setSaveError(formatStorageError(error));
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
          { key: "enter", action: "save" },
          { key: "esc", action: "cancel" },
        ];

  return (
    <FrameBox title="Welcome to temper" hints={hints} minHeight={10}>
      <Box marginBottom={1}>
        <Text color={theme.lavender}>Step {stepInfo.num} of 2</Text>
        <Text color={theme.dim}>  ·  </Text>
        <Text color={theme.dim}>{stepInfo.desc}</Text>
      </Box>

      {savePending && <Text color={theme.dim}>Saving settings...</Text>}
      {saveError && <Text color={step === "done" ? theme.yellow : theme.red}>{saveError}</Text>}

      {step === "theme" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={theme.text}>Select theme</Text>
          </Box>
          {THEME_META.map((t, i) => (
            <Box key={t.key}>
              <Text color={i === cursor ? theme.primary : theme.dim}>
                {"  "}{i === cursor ? "●" : "○"}{" "}
              </Text>
              <Text color={i === cursor ? theme.text : theme.dim} bold={i === cursor}>
                {t.label.padEnd(18)}
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
