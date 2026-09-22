import React from "react";
import { render } from "ink";
import { writeFile } from "node:fs/promises";
import { UpdatePrompt } from "../../src/tui/UpdatePrompt.tsx";

const [scenario, resultPath, childPath] = process.argv.slice(2);
if (!resultPath || !childPath) throw new Error("Temporary result paths are required");
const instance = render(<UpdatePrompt current="0.4.1" latest="0.5.0" onUpdate={async execute => {
  const behavior = scenario === "interrupt" ? "setTimeout(()=>{},30000)"
    : scenario === "input" ? "process.stdout.write('Proceed? '); process.stdin.once('data',answer=>{console.log('ANSWER:'+answer.toString().trim());process.exit(0)})"
    : scenario === "logs" ? "for(let i=0;i<50000;i++)console.log('Removing: /tmp/cache/file... (120KB)');console.error('Warning: keep this diagnostic');process.exit(0)"
    : `process.exit(${scenario === "failure" ? 7 : 0})`;
  const child = `require('node:fs').writeFileSync(${JSON.stringify(childPath)}, JSON.stringify({pid:process.pid,tty:process.stdin.isTTY,outputTTY:process.stdout.isTTY,raw:process.stdin.isRaw===true})); console.log('CHILD_READY'); ${behavior}`;
  await execute({ file: process.execPath, args: ["-e", child] });
  return { status: "updated", version: "0.5.0" };
}} />, { exitOnCtrlC: false });
const result = await instance.waitUntilExit();
instance.cleanup();
await writeFile(resultPath, JSON.stringify({ result, raw: process.stdin.isRaw === true }));
