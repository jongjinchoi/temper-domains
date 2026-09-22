import React from "react";
import { render } from "ink";
import { writeFile } from "node:fs/promises";
import { UpdatePrompt } from "../../src/tui/UpdatePrompt.tsx";

const [scenario, resultPath, childPath] = process.argv.slice(2);
if (!resultPath || !childPath) throw new Error("Temporary result paths are required");
const instance = render(<UpdatePrompt current="0.4.1" latest="0.5.0" commands={[{ file: "fake-installer", args: [] }]} onUpdate={async execute => {
  const child = `require('node:fs').writeFileSync(${JSON.stringify(childPath)}, JSON.stringify({tty:process.stdin.isTTY,raw:process.stdin.isRaw===true})); console.log('CHILD_READY'); ${scenario === "interrupt" ? "setTimeout(()=>{},30000)" : `process.exit(${scenario === "failure" ? 7 : 0})`}`;
  await execute({ file: process.execPath, args: ["-e", child] });
  return { status: "updated", version: "0.5.0" };
}} />, { exitOnCtrlC: false });
const result = await instance.waitUntilExit();
await writeFile(resultPath, JSON.stringify({ result, raw: process.stdin.isRaw === true }));
