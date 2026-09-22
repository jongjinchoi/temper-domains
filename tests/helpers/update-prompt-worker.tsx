import { PassThrough, Writable } from "node:stream";
import React from "react";
import { render } from "ink";
import { UpdatePrompt } from "../../src/tui/UpdatePrompt.tsx";

const scenario = process.argv[2];
let frame = ""; let raw = false; let executed = 0; const modes: boolean[] = [];
const stdout = new Writable({ write(chunk, _encoding, callback) { frame += String(chunk); callback(); } });
Object.assign(stdout, { isTTY: true, columns: 110, rows: 30 });
const stdin = new PassThrough();
Object.assign(stdin, { isTTY: true, setRawMode(value: boolean) { raw = value; modes.push(value); }, ref() {}, unref() {} });
const view = render(<UpdatePrompt current="0.4.1" latest="0.5.0" commands={[{ file: "npm", args: ["install", "-g", "temper-domains@0.5.0"] }]} onUpdate={async (execute, confirm) => {
  executed++;
  if (scenario === "changed" && !await confirm("0.6.0")) return { status: "cancelled" };
  await execute({ file: process.execPath, args: ["-e", "setTimeout(() => process.exit(0), 80)"] });
  if (scenario === "failure") throw new Error("installer failed");
  return { status: "updated", version: "0.5.0" };
}} />, {
  stdout: stdout as NodeJS.WriteStream, stderr: stdout as NodeJS.WriteStream,
  stdin: stdin as unknown as NodeJS.ReadStream, interactive: true, patchConsole: false, exitOnCtrlC: false,
});
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
await pause();
if (scenario === "cancel") stdin.write("\x03");
else if (scenario === "later") stdin.write("\r");
else { stdin.write("\x1b[A"); await pause(); stdin.write("\r"); }
if (scenario === "changed") { await pause(); stdin.write("\r"); }
const result = await view.waitUntilExit();
console.log(JSON.stringify({ result, executed, raw, modes, frame }));
