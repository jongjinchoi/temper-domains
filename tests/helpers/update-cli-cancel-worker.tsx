import { mock } from "bun:test";
import * as ink from "ink";
import * as processes from "../../src/update/process.ts";
import { mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

const home = await realpath(await mkdtemp(join(tmpdir(), "temper-update-cli-cancel-")));
const entry = join(home, "index.js");
await writeFile(entry, "");
let frame = "", raw = false, executions = 0, queries = 0;
let release: (() => void) | undefined;
const stdout = new Writable({ write(chunk, _encoding, callback) { frame += String(chunk); callback(); } });
Object.assign(stdout, { isTTY: true, columns: 110, rows: 30 });
const stdin = new PassThrough();
Object.assign(stdin, { isTTY: true, setRawMode(value: boolean) { raw = value; }, ref() {}, unref() {} });
const realRender = ink.render;
mock.module("ink", () => ({ ...ink, render: (node: Parameters<typeof ink.render>[0], options: object) =>
  realRender(node, { ...options, stdout: stdout as NodeJS.WriteStream, stderr: stdout as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream, interactive: true, patchConsole: false }) }));
mock.module("../../src/update/check.ts", () => ({ checkForUpdate: async () => ({ current: "0.4.1", latest: "0.5.0", lockDirectory: home,
  installation: { kind: "npm", channel: "npm", identity: home, entry, root: home, prefix: home,
    node: process.execPath, npm: { file: "never-execute-npm", args: [] }, guidance: "" } }) }));
mock.module("../../src/update/process.ts", () => ({ ...processes, runProcess: async () => {
  if (++queries === 1) await new Promise<void>(resolve => { release = resolve; });
  return { stdout: queries === 1 ? "0.4.1" : "0.5.0", stderr: "" };
} }));
mock.module("../../src/update/installer.ts", () => ({ runInstaller: async () => { executions++; } }));
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
for (const key of ["CI", "CONTINUOUS_INTEGRATION", "BUILD_NUMBER", "TEMPER_NO_UPDATE_CHECK"]) delete process.env[key];
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
const until = async (ready: () => boolean) => {
  const deadline = Date.now() + 3000;
  while (!ready() && Date.now() < deadline) await pause();
  if (!ready()) throw new Error("CLI prompt gate not reached");
};
try {
  const { maybeUpdate } = await import("../../src/update/cli.ts");
  const pending = maybeUpdate("search");
  await until(() => frame.includes("Update now"));
  stdin.write("\x1b[A"); await new Promise(resolve => setTimeout(resolve, 30)); stdin.write("\r");
  await until(() => Boolean(release));
  stdin.write("\x03"); await new Promise(resolve => setTimeout(resolve, 30)); release!();
  const stopped = await pending;
  const locks = (await readdir(home)).filter(name => name.endsWith(".lock"));
  console.log(JSON.stringify({ stopped, executions, raw, locks }));
} finally { await rm(home, { recursive: true, force: true }); }
