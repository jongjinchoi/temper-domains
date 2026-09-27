import "./home.ts";
import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import React from "react";
import { render } from "ink";

const mode = process.argv[2]!;
const directory = join(process.env.TEMPER_TEST_HOME!, ".temper");
const original = { ...fs };
await original.mkdir(directory, { recursive: true });
const entry = { query: "selected", timestamp: "2026-09-27T00:00:00Z", available: 1, total: 1 };
await original.writeFile(join(directory, "history.json"), JSON.stringify([entry]));
await original.writeFile(join(directory, "watchlist.json"), JSON.stringify([{ domain: "acme.com", addedAt: entry.timestamp }]));
await original.writeFile(join(directory, "config.json"), '{"theme":"temper-forge","registrar":"cloudflare"}');
const target = join(directory, mode === "init" ? "config.json" : mode.startsWith("history") || mode === "search-history" ? "history.json" : "watchlist.json");
let injected = 0;
let lockPath = "";
const canonicalLock = join(await original.realpath(directory), basename(target) + ".lock");
mock.module("node:fs/promises", () => ({ ...original, unlink: async (...args: Parameters<typeof fs.unlink>) => {
  const path = String(args[0]);
  if (join(await original.realpath(dirname(path)), basename(path)) === canonicalLock) {
    injected++; lockPath = path; throw new Error("storage cleanup denied");
  }
  return original.unlink(...args);
} }));
mock.module("../../src/checker/checker.ts", () => ({
  checkFullDomains: async function* (domains: string[]) {
    for (const domain of domains) yield { domain, tld: "com", status: "available", method: "rdap", responseTime: 1, attempts: 1 };
  },
}));
const { default: InitView } = await import("../../src/tui/InitView.tsx");
const { default: WatchlistView } = await import("../../src/tui/WatchlistView.tsx");
const { default: HistoryView } = await import("../../src/tui/HistoryView.tsx");
const { default: SearchView } = await import("../../src/tui/SearchView.tsx");
if (mode === "search-history") await original.writeFile(target, "{");
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
let frame = "";
const output = new Writable({ write(chunk, _encoding, callback) { frame = String(chunk); callback(); } });
Object.assign(output, { columns: 240, rows: 60, isTTY: true });
const input = new PassThrough();
Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
const element = mode === "init" ? <InitView /> : mode === "watch" ? <WatchlistView />
  : mode.startsWith("history") ? <HistoryView /> : <SearchView query="acme" tlds={["com"]} />;
const view = render(element, { stdout: output as NodeJS.WriteStream, stderr: output as NodeJS.WriteStream,
  stdin: input as unknown as NodeJS.ReadStream, debug: true, patchConsole: false, exitOnCtrlC: false });
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(10);
  if (!predicate()) throw new Error(`Timed out: ${frame}`);
}
try {
  if (mode === "init") {
    await until(() => frame.includes("Choose your preferred registrar"));
    input.write("\r");
    await until(() => frame.includes("Choose a theme"));
    await original.writeFile(target, "{");
    input.write("\r");
  } else if (mode !== "search-history") {
    await until(() => frame.includes(mode.startsWith("history") ? "selected" : "acme.com"));
    if (!mode.startsWith("history")) await until(() => frame.includes("available"));
    if (mode === "search-add") await until(() => frame.includes("a add"));
    await original.writeFile(target, mode === "history-conflict" ? JSON.stringify([{ ...entry, query: "new" }, entry]) : "{");
    input.write(mode === "search-add" ? "a" : "d");
  }
  await until(() => frame.replace(/[│\s]/g, "").includes("storagecleanupdenied"));
  console.log(JSON.stringify({ frame, injected, target, lockPath, data: await original.readFile(target, "utf8"), lock: await Bun.file(target + ".lock").exists() }));
} finally { view.unmount(); view.cleanup(); }
