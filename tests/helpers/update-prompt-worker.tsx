import { PassThrough, Writable } from "node:stream";
import React from "react";
import { render } from "ink";
import { UpdatePrompt } from "../../src/tui/UpdatePrompt.tsx";
import { performUpdate } from "../../src/update/runner.ts";
import { mkdtemp, realpath, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scenario = process.argv[2];
let frame = ""; let raw = false; let executed = 0; const modes: boolean[] = [];
const stdout = new Writable({ write(chunk, _encoding, callback) { frame += String(chunk); callback(); } });
Object.assign(stdout, { isTTY: true, columns: 110, rows: 30 });
const stdin = new PassThrough();
Object.assign(stdin, { isTTY: true, setRawMode(value: boolean) { raw = value; modes.push(value); }, ref() {}, unref() {} });
const preflight = scenario?.startsWith("preflight-");
const home = preflight ? await realpath(await mkdtemp(join(tmpdir(), "temper-prompt-"))) : "";
const entry = join(home, "index.js");
if (preflight) await writeFile(entry, "");
let release: (() => void) | undefined;
let settled = false;
const view = render(<UpdatePrompt current="0.4.1" latest="0.5.0" onUpdate={async (execute, confirm, stage, signal) => {
  if (preflight) {
    let queries = 0;
    return performUpdate({ kind: "npm", channel: "npm", identity: home, entry, root: home, prefix: home,
      node: process.execPath, npm: { file: "never-execute-npm", args: [] }, guidance: "" }, "0.5.0", {
      lockDirectory: home, signal, confirmTarget: confirm, onStage: stage,
      query: async () => {
        if (++queries === 1) await new Promise<void>(resolve => { release = resolve; });
        return { stdout: queries === 1 ? "0.4.1" : "0.5.0", stderr: "" };
      },
      execute: async () => { executed++; },
    });
  }
  executed++;
  if (scenario === "changed" && !await confirm("0.6.0")) return { status: "cancelled" };
  await stage("installing");
  await execute({ file: process.execPath, args: ["-e", "setTimeout(() => process.exit(0), 80)"] }, { channel: "npm", stage: "installing", current: "0.4.1", target: "0.5.0" });
  if (scenario === "failure") throw new Error("installer failed");
  await stage("verifying");
  return { status: "updated", version: "0.5.0" };
}} />, {
  stdout: stdout as NodeJS.WriteStream, stderr: stdout as NodeJS.WriteStream,
  stdin: stdin as unknown as NodeJS.ReadStream, interactive: true, patchConsole: false, exitOnCtrlC: false,
});
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
const pending = view.waitUntilExit().then(result => { settled = true; return result; });
await pause();
if (scenario === "cancel") stdin.write("\x03");
else if (scenario === "later") stdin.write("\r");
else { stdin.write("\x1b[A"); await pause(); stdin.write("\r"); }
if (scenario === "changed") { await pause(); stdin.write("\r"); }
if (preflight) {
  const deadline = Date.now() + 3000;
  while (!release && Date.now() < deadline) await pause();
  if (!release) throw new Error("Preflight gate not entered");
  stdin.write(scenario === "preflight-escape" ? "\x1b" : "\x03");
  await pause();
  stdin.write("\x03");
  await pause();
  if (settled) throw new Error("Prompt exited before query and lock cleanup");
  release();
}
const result = await pending;
const locks = home ? (await readdir(home)).filter(name => name.endsWith(".lock")) : [];
if (home) await rm(home, { recursive: true, force: true });
console.log(JSON.stringify({ result, executed, raw, modes, frame, locks }));
