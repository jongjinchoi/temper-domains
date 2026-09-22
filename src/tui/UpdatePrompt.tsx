import { Box, Text, useApp, useInput } from "ink";
import { useRef, useState } from "react";
import { displayInvocation, runProcess, type Invocation } from "../update/process.ts";
import type { UpdateOutcome } from "../update/runner.ts";

export type PromptOutcome = { kind: "later" | "cancelled" } | { kind: "updated" | "current"; version: string } | { kind: "failed"; message: string };
interface Props {
  current: string;
  latest: string;
  commands: Invocation[];
  guidance?: string;
  onUpdate?: (execute: (command: Invocation) => Promise<void>, confirmTarget: (version: string) => Promise<boolean>) => Promise<UpdateOutcome>;
}

export function UpdatePrompt({ current, latest, commands, guidance, onUpdate }: Props) {
  const { exit, suspendTerminal } = useApp();
  const [selected, setSelected] = useState(1);
  const [target, setTarget] = useState(latest);
  const [phase, setPhase] = useState<"choice" | "running" | "changed">("choice");
  const busy = useRef(false);
  const answer = useRef<((approved: boolean) => void) | null>(null);
  const finish = (outcome: PromptOutcome) => exit(outcome);
  const start = async () => {
    if (!onUpdate || busy.current) return;
    busy.current = true;
    setPhase("running");
    try {
      const result = await onUpdate(
        async command => { await suspendTerminal(async () => { await runProcess(command, { inherit: true }); }); },
        async version => {
          setTarget(version); setSelected(1); setPhase("changed");
          return new Promise<boolean>(resolve => { answer.current = resolve; });
        },
      );
      finish(result.status === "cancelled" ? { kind: "cancelled" } : { kind: result.status, version: result.version });
    } catch (error) {
      finish({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  };
  useInput((input, key) => {
    if (phase === "running") return;
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
  return <Box flexDirection="column" paddingY={1}>
    <Text bold>Temper update available: {current} → {target}</Text>
    {guidance ? <Text>{guidance}</Text> : <>
      <Text>{phase === "changed" ? "Homebrew now offers a different version. Approve this target before upgrading:" : "The following commands will run only after you choose Update now:"}</Text>
      {commands.map((command, i) => <Text key={i}>{displayInvocation(command)}</Text>)}
    </>}
    {phase === "running" ? <Text>Updating…</Text> : onUpdate ? <>
      <Text>{selected === 0 ? "❯" : " "} Update now</Text>
      <Text>{selected === 1 ? "❯" : " "} {phase === "changed" ? "Cancel update" : "Later"}</Text>
      <Text dimColor>↑/↓ select · Enter confirm · Esc/Ctrl+C cancel</Text>
    </> : <Text>Enter: continue · Esc/Ctrl+C: cancel</Text>}
  </Box>;
}
