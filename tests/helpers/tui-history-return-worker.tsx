import "./home.ts";
import assert from "node:assert/strict";
import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import React, { useState } from "react";
import { render, Text } from "ink";

assert.equal(homedir(), process.env.TEMPER_TEST_HOME);
const original = { ...fs };
const directory = join(await original.realpath(homedir()), ".temper");
await original.mkdir(directory);
const file = join(directory, "history.json");
const initial = [{ query: "acme", timestamp: "2026-09-20T00:00:00Z", available: 1, total: 1 }];
await original.writeFile(file, JSON.stringify(initial));
const mode = process.argv[2]!;
const delayed = ["delayed", "write-failure", "cleanup-failure", "leave-save"].includes(mode);
let releaseSave!: () => void, releaseRead!: () => void;
const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
let saveBlocked = false, saveFinished = false, afterReturn = false;
let returnReads = 0, readBlocked = false, readFinished = false, cleanups = 0;
let lockPath = "";
const isHistory = (path: unknown) => String(path) === file || String(path) === join(homedir(), ".temper/history.json");
mock.module("node:fs/promises", () => ({ ...original,
  rename: async (...args: Parameters<typeof fs.rename>) => {
    if (isHistory(args[1]) && delayed) {
      saveBlocked = true;
      await saveGate;
      if (mode === "write-failure") throw new Error("Controlled history write failure");
    }
    return original.rename(...args);
  },
  unlink: async (...args: Parameters<typeof fs.unlink>) => {
    const path = String(args[0]);
    if (basename(path) === "history.json.lock" && await original.realpath(dirname(path)) === directory) {
      cleanups++;
      lockPath = path;
      saveFinished = true;
      if (mode === "cleanup-failure") throw new Error("Controlled history cleanup failure");
    }
    return original.unlink(...args);
  },
  readFile: async (...args: Parameters<typeof fs.readFile>) => {
    if (afterReturn && isHistory(args[0])) {
      returnReads++;
      if (mode === "read-failure") throw new Error("Controlled history read failure");
      const content = await original.readFile(...args);
      if (mode === "leave-read") { readBlocked = true; await readGate; }
      readFinished = true;
      return content;
    }
    return original.readFile(...args);
  },
}));
let searches = 0;
mock.module("../../src/checker/checker.ts", () => ({ checkFullDomains: async function* (domains: string[]) {
  searches++;
  for (const domain of domains) yield { domain, tld: domain.split(".").at(-1)!, status: "available", method: "rdap", responseTime: 1, attempts: 1 };
} }));
const { default: HistoryView } = await import("../../src/tui/HistoryView.tsx");
const unhandled: unknown[] = [];
process.on("unhandledRejection", error => unhandled.push(error));
function Harness() {
  const [left, setLeft] = useState(false);
  return left ? <Text>Parent screen</Text> : <HistoryView onBack={() => setLeft(true)} />;
}
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
let frame = "";
const stdout = new Writable({ write(chunk, _encoding, callback) {
  frame = String(chunk).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ""); callback();
} });
Object.assign(stdout, { columns: 110, rows: 40, isTTY: true });
const stdin = new PassThrough();
Object.assign(stdin, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
const view = render(<Harness />, { stdout: stdout as NodeJS.WriteStream, stderr: stdout as NodeJS.WriteStream,
  stdin: stdin as unknown as NodeJS.ReadStream, debug: true, patchConsole: false, exitOnCtrlC: false });
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(10);
  assert.ok(predicate(), frame);
}
const entries = async () => JSON.parse(await original.readFile(file, "utf8"));
try {
  await until(() => frame.includes("▸") && frame.includes("acme") && frame.includes("Total: 1 searches"));
  stdin.write("\r");
  if (delayed) await until(() => saveBlocked && frame.includes("available"));
  else await until(() => frame.includes("a add"));
  afterReturn = true;
  stdin.write("\x1b");
  if (delayed || mode === "leave-read") {
    await until(() => frame.includes("Refreshing history"));
    if (mode === "leave-read") await until(() => readBlocked);
    else assert.equal(returnReads, 0, "history must not be read before the pending save settles");
    // A row action must not use the old snapshot while refresh is pending.
    stdin.write("d"); stdin.write("\r"); stdin.write("j");
    if (mode.startsWith("leave-")) {
      stdin.write("\x1b");
      await until(() => frame.includes("Parent screen"));
    }
    releaseSave(); releaseRead();
  }
  if (mode.startsWith("leave-")) {
    await until(() => mode === "leave-save" ? saveFinished : readFinished);
    // Drain callbacks already queued by the released I/O, without timing retries.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(frame.includes("Parent screen"));
    assert.equal(returnReads, mode === "leave-save" ? 0 : 1);
    assert.equal((await entries()).length, 2);
  } else if (mode === "read-failure") {
    await until(() => frame.includes("Controlled history read failure") && frame.includes("acme"));
    assert.ok(frame.includes("Total: 1 searches"));
    stdin.write("d"); stdin.write("\r");
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal((await entries()).length, 2);
    assert.equal(searches, 1);
    stdin.write("\x1b");
    await until(() => frame.includes("Parent screen"));
  } else {
    const expected = mode === "write-failure" ? 1 : 2;
    await until(() => frame.includes(`Total: ${expected} searches`) && frame.includes("▸") && !frame.includes("Refreshing history"));
    assert.equal((await entries()).length, expected);
    if (mode === "write-failure") {
      assert.ok(frame.includes("Controlled history write failure"));
      assert.deepEqual(await entries(), initial);
    }
    if (mode === "cleanup-failure") {
      assert.ok(frame.includes("was saved, but cleanup failed"));
      const compact = frame.replace(/[│\s]/g, "");
      assert.ok(compact.includes(lockPath.replace(/\s/g, "")), frame);
      assert.equal(compact.match(/removeonly/g)?.length, 1);
      assert.equal(await Bun.file(file + ".lock").exists(), true);
    }
    if (mode === "fast-reentry") {
      afterReturn = false;
      stdin.write("\r");
      await until(() => searches === 2 && frame.includes("a add"));
      afterReturn = true;
      stdin.write("\x1b");
      await until(() => frame.includes("Total: 3 searches") && frame.includes("▸"));
      assert.equal((await entries()).length, 3);
    }
  }
  assert.equal(searches, mode === "fast-reentry" ? 2 : 1);
  assert.equal(cleanups, searches, "blocked row actions must not start a deletion");
  assert.deepEqual(unhandled, []);
  console.log(JSON.stringify({ mode, searches, returnReads, cleanups }));
} finally { releaseSave(); releaseRead(); view.unmount(); view.cleanup(); }
