import "./home.ts";
import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import React from "react";
import { render } from "ink";

const scenario = process.argv[2];
const directory = join(process.env.TEMPER_TEST_HOME!, ".temper");
const path = join(directory, "config.json");
const original = { ...fs };
const initial = { theme: "temper-forge", registrar: "cloudflare" };
await original.mkdir(directory, { recursive: true });
await original.writeFile(path, JSON.stringify(initial));
let replacements = 0;
mock.module("node:fs/promises", () => ({
  ...original,
  rename: async (...args: Parameters<typeof fs.rename>) => {
    await original.rename(...args);
    replacements++;
  },
  unlink: async (...args: Parameters<typeof fs.unlink>) => {
    if (scenario === "init-cleanup" && String(args[0]).endsWith(".lock")) throw new Error("test lock cleanup failed");
    return original.unlink(...args);
  },
}));
const { default: InitView } = await import("../../src/tui/InitView.tsx");
const unhandled: string[] = [];
process.on("unhandledRejection", error => unhandled.push(String(error)));
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
let frame = "";
const output = new Writable({ write(chunk, _encoding, callback) { frame = String(chunk); callback(); } });
Object.assign(output, { columns: 110, rows: 40, isTTY: true });
const input = new PassThrough();
Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
const view = render(<InitView currentConfig={initial} />, {
  stdout: output as NodeJS.WriteStream, stderr: output as NodeJS.WriteStream,
  stdin: input as unknown as NodeJS.ReadStream, debug: true, patchConsole: false, exitOnCtrlC: false,
});
let exited = false;
void view.waitUntilExit().then(() => { exited = true; });
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2500;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(10);
  if (!predicate()) throw new Error(`Timed out: ${frame}`);
}
let pendingFrame = "";
let failureFrame = "";
try {
  await until(() => frame.includes("Choose your preferred registrar"));
  input.write("\r");
  await until(() => frame.includes("Choose a theme"));
  input.write("j");
  await Bun.sleep(50);
  if (scenario === "init-repeat" || scenario === "init-leave") await original.writeFile(path + ".lock", "test owner");
  if (scenario === "init-retry") await original.writeFile(path, "{");
  input.write("\r");
  if (scenario === "init-repeat" || scenario === "init-leave") {
    await Bun.sleep(100);
    pendingFrame = frame;
    if (scenario === "init-repeat") { input.write("\r"); input.write("\r"); }
    else { view.unmount(); view.cleanup(); }
    await original.unlink(path + ".lock");
    await until(() => replacements > 0 || unhandled.length > 0);
    await Bun.sleep(150);
  } else if (scenario === "init-retry") {
    await until(() => frame.includes("not saved") || unhandled.length > 0);
    failureFrame = frame;
    await original.writeFile(path, JSON.stringify(initial));
    input.write("\r");
    await until(() => frame.includes("Setup complete"));
  } else {
    await until(() => frame.includes("cleanup") || unhandled.length > 0);
    await Bun.sleep(2200);
  }
  const config = JSON.parse(await original.readFile(path, "utf8"));
  const result = { frame, pendingFrame, failureFrame, config, replacements, unhandled, exited };
  view.unmount();
  view.cleanup();
  console.log(JSON.stringify(result));
} finally { view.unmount(); view.cleanup(); }
