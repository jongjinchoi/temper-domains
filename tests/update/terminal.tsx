import React from "react";
import { render } from "ink";
import { writeFile } from "node:fs/promises";
import { UpdatePrompt } from "../../src/tui/UpdatePrompt.tsx";

const [scenario, resultPath, childPath] = process.argv.slice(2);
if (!resultPath || !childPath) throw new Error("Temporary result paths are required");
const instance = render(<UpdatePrompt current="0.4.1" latest="0.5.0" installer={scenario === "npm-env" ? "npm" : "Homebrew"} onUpdate={async (execute, _confirmTarget, onStage) => {
  const behavior = scenario === "interrupt" ? "setTimeout(()=>{},30000)"
    : scenario === "input" || scenario === "unknown-input" ? `process.stdout.write(${JSON.stringify(scenario === "input" ? "Proceed? " : "Type a confirmation token: ")}); process.stdin.once('data',answer=>{console.log('ANSWER:'+answer.toString().trim());process.exit(0)})`
    : scenario === "logs" ? "for(let i=0;i<50000;i++)console.log('Removing: /tmp/cache/file... (120KB)');process.stdout.write('Remov');setTimeout(()=>{console.log('ing: /tmp/cache/file... (120KB)');process.stdout.write('\\x1b[2K\\r⠋ Formula temper (0.5.0) #### Downloading 10MB/20MB\\r');console.error('Warning: keep this diagnostic');process.exit(0)},70)"
    : `process.exit(${scenario === "failure" ? 7 : 0})`;
  const child = `require('node:fs').writeFileSync(${JSON.stringify(childPath)}, JSON.stringify({pid:process.pid,tty:process.stdin.isTTY,outputTTY:process.stdout.isTTY,raw:process.stdin.isRaw===true,term:process.env.TERM})); console.log('CHILD_READY'); ${behavior}`;
  await execute({ file: process.execPath, args: ["-e", child] });
  await onStage("verifying");
  await new Promise(resolve => setTimeout(resolve, 100));
  if (scenario === "verify-failure") throw new Error("Update verification failed: expected 0.5.0, found 0.4.1");
  return { status: "updated", version: "0.5.0" };
}} />, { exitOnCtrlC: false });
const result = await instance.waitUntilExit();
instance.cleanup();
await writeFile(resultPath, JSON.stringify({ result, raw: process.stdin.isRaw === true }));
