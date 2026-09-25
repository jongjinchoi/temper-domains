import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import type { Invocation } from "../update/process.ts";
import { runInstaller } from "../update/installer.ts";
import { progressLabel, progressRows, type InstallerContext } from "../update/presentation.ts";
import { theme } from "./theme.ts";
import type { UpdateOutcome, UpdateStage } from "../update/runner.ts";
import Spinner from "./Spinner.tsx";

export type PromptOutcome = { kind: "later" | "cancelled" } | { kind: "updated" | "current"; version: string } | { kind: "failed"; message: string };
interface Props {
  current: string;
  latest: string;
  installer?: string;
  guidance?: string;
  onUpdate?: (execute: (command: Invocation, context: InstallerContext) => Promise<void>, confirmTarget: (version: string) => Promise<boolean>, onStage: (stage: UpdateStage) => Promise<void>) => Promise<UpdateOutcome>;
}

export function UpdatePrompt({ current, latest, installer, guidance, onUpdate }: Props) {
  const { exit, suspendTerminal, waitUntilRenderFlush } = useApp();
  const [selected, setSelected] = useState(1);
  const [target, setTarget] = useState(latest);
  const [phase, setPhase] = useState<"choice" | "running" | "changed">("choice");
  const [stage, setStage] = useState<UpdateStage>("installing");
  const [outcome, setOutcome] = useState<PromptOutcome | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (outcome) void waitUntilRenderFlush().then(() => exit(outcome));
  }, [outcome, exit, waitUntilRenderFlush]);
  const answer = useRef<((approved: boolean) => void) | null>(null);
  const finish = (result: PromptOutcome) => setOutcome(result);
  const start = async () => {
    if (!onUpdate || busy.current) return;
    busy.current = true;
    setPhase("running");
    try {
      const result = await onUpdate(
        async (command, context) => { await suspendTerminal(async () => { await runInstaller(command, context); }); },
        async version => {
          setTarget(version); setSelected(1); setPhase("changed");
          return new Promise<boolean>(resolve => { answer.current = resolve; });
        },
        async nextStage => {
          setStage(nextStage);
          // Let React commit the stage before waiting for Ink's terminal flush.
          await new Promise<void>(resolve => setImmediate(resolve));
          await waitUntilRenderFlush();
        },
      );
      finish(result.status === "cancelled" ? { kind: "cancelled" } : { kind: result.status, version: result.version });
    } catch (error) {
      finish({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  };
  useInput((input, key) => {
    if (outcome || phase === "running") return;
    if (key.escape || (key.ctrl && input === "c")) {
      if (answer.current) { const resolve = answer.current; answer.current = null; setPhase("running"); resolve(false); }
      else finish({ kind: "cancelled" });
      return;
    }
    if (key.upArrow || key.downArrow) setSelected(previous => previous === 0 ? 1 : 0);
    if (!key.return) return;
    if (answer.current) {
      const resolve = answer.current; answer.current = null; setPhase("running"); resolve(selected === 0);
    } else if (busy.current) return;
    else if (!onUpdate || selected === 1) finish({ kind: "later" });
    else void start();
  });
  if (outcome) {
    if (outcome.kind === "updated") return <Text color={theme.text}><Text color={theme.green}>✓</Text> Temper updated: {current} → {outcome.version}</Text>;
    if (outcome.kind === "current") return <Text>Temper {outcome.version} is already installed.</Text>;
    // The caller reports failures/cancellation after the terminal is restored.
    return null;
  }
  if (phase === "running") return <Box flexDirection="column">
    {progressRows(progressLabel(stage, current, target), "", stage !== "verifying").map((row, index) =>
      <Text key={index}>{row.length === 0 ? " " : row.map((part, position) => position === 0 && index === 0
        ? <Spinner key={position} /> : <Text key={position} color={theme[part.role]}>{part.text}</Text>)}</Text>)}
  </Box>;
  return <Box flexDirection="column">
    <Text bold color={theme.primary}>Update available! {current} → {target}</Text>
    <Box marginY={1} flexDirection="column">
      {guidance ? <Text color={theme.text}>{guidance}</Text> : <>
        <Text color={theme.text}>Update using {installer ?? "your package manager"}</Text>
        {phase === "changed" && <Text color={theme.yellow}>Homebrew offers a different version. Approve this version to continue.</Text>}
      </>}
    </Box>
    {onUpdate ? <>
      <Text bold={selected === 0} color={selected === 0 ? theme.primary : theme.text}>{selected === 0 ? "❯" : " "} Update now</Text>
      <Text bold={selected === 1} color={selected === 1 ? theme.primary : theme.text}>{selected === 1 ? "❯" : " "} {phase === "changed" ? "Cancel update" : "Later"}</Text>
      <Box marginTop={1}><Text color={theme.dim}>↑/↓ select · Enter confirm · Esc/Ctrl+C cancel</Text></Box>
    </> : <Text color={theme.dim}>Enter: continue · Esc/Ctrl+C: cancel</Text>}
  </Box>;
}
