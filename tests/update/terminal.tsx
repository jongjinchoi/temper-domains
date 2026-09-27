import React from "react";
import { render } from "ink";
import { writeFile, realpath, readdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { UpdatePrompt } from "../../src/tui/UpdatePrompt.tsx";
import { setTheme } from "../../src/tui/theme.ts";
import { performUpdate } from "../../src/update/runner.ts";
import { injectUpdateLockFaults } from "../helpers/update-lock-faults.ts";

setTheme(process.env.TEMPER_TEST_THEME ?? "temper-forge");

const [scenario, resultPath, childPath] = process.argv.slice(2);
if (!resultPath || !childPath) throw new Error("Temporary result paths are required");
const preflight = scenario?.startsWith("preflight-");
const cleanup = scenario?.startsWith("cleanup-");
let executions = 0;
const home = await realpath(dirname(resultPath));
const entry = join(home, "entry.js");
if (preflight || cleanup) await writeFile(entry, "");
const injection = cleanup ? await injectUpdateLockFaults(home) : undefined;
if (injection) {
  injection.faults.close = scenario !== "cleanup-unlink";
  injection.faults.unlink = scenario !== "cleanup-close";
}
const instance = render(<UpdatePrompt current="0.4.1" latest="0.5.0" installer={scenario === "npm-env" ? "npm" : "Homebrew"} onUpdate={async (execute, confirmTarget, onStage, signal) => {
  if (preflight) {
    let queries = 0;
    return performUpdate({ kind: "npm", channel: "npm", identity: home, entry, root: home, prefix: home,
      node: process.execPath, npm: { file: "never-execute-npm", args: [] }, guidance: "" }, "0.5.0", {
      lockDirectory: home, signal, confirmTarget, onStage,
      query: async () => {
        if (++queries === 1) {
          await writeFile(childPath + ".ready", "ready");
          const deadline = Date.now() + 8000;
          while (!await access(childPath + ".release").then(() => true, () => false)) {
            if (Date.now() > deadline) throw new Error("Preflight gate not released");
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
        return { stdout: queries === 1 ? "0.4.1" : "0.5.0", stderr: "" };
      }, execute: async () => { executions++; },
    });
  }
  const behavior = scenario === "interrupt" ? "setTimeout(()=>{},30000)"
    : scenario === "input" || scenario === "unknown-input" ? `process.stdout.write(${JSON.stringify(scenario === "input" ? "Proceed? " : "Type a confirmation token: ")}); process.stdin.once('data',answer=>{console.log('ANSWER:'+answer.toString().trim());process.exit(0)})`
    : scenario === "logs" ? "for(let i=0;i<50000;i++)console.log('Removing: /tmp/cache/file... (120KB)');process.stdout.write('Remov');setTimeout(()=>{console.log('ing: /tmp/cache/file... (120KB)');process.stdout.write('\\x1b[2K\\r⠋ Formula temper (0.5.0) #### Downloading 10MB/20MB\\r');console.error('Warning: keep this diagnostic');process.exit(0)},70)"
    : scenario === "resize" ? "setTimeout(()=>{console.log('Warning: after resize');process.exit(0)},600)"
    : scenario === "failure" || scenario === "cleanup-failed" ? "console.error('Error: checksum mismatch');process.exit(7)" : "process.exit(0)";
  const child = `require('node:fs').writeFileSync(${JSON.stringify(childPath)}, JSON.stringify({pid:process.pid,tty:process.stdin.isTTY,outputTTY:process.stdout.isTTY,raw:process.stdin.isRaw===true,term:process.env.TERM})); console.log('CHILD_READY'); ${behavior}`;
  const install = () => execute({ file: process.execPath, args: ["-e", child] }, { channel: scenario === "npm-env" ? "npm" : "homebrew", stage: "installing", current: "0.4.1", target: "0.5.0" });
  if (cleanup) {
    let queries = 0;
    return performUpdate({ kind: "npm", channel: "npm", identity: home, entry, root: home, prefix: home,
      node: process.execPath, npm: { file: "never-execute-npm", args: [] }, guidance: "" }, "0.5.0", {
      lockDirectory: home, signal, confirmTarget, onStage,
      query: async () => ({ stdout: ++queries === 1 ? "0.4.1" : "0.5.0", stderr: "" }),
      execute: async () => { executions++; await install(); },
    });
  }
  await install();
  await onStage("verifying");
  await new Promise(resolve => setTimeout(resolve, 100));
  if (scenario === "verify-failure") throw new Error("Update verification failed: expected 0.5.0, found 0.4.1");
  return { status: "updated", version: "0.5.0" };
}} />, { exitOnCtrlC: false });
const result = await instance.waitUntilExit();
instance.cleanup();
const locks = (await readdir(home)).filter(name => name.endsWith(".lock"));
await writeFile(resultPath, JSON.stringify({ result, raw: process.stdin.isRaw === true, executions, locks }));
await injection?.restore();
