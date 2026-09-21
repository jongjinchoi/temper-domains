import "./home.ts";
import { mock } from "bun:test";
import { PassThrough, Writable } from "node:stream";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";
import { render } from "ink";
import SearchView from "../../src/tui/SearchView.tsx";
import SuggestView from "../../src/tui/SuggestView.tsx";
import HistoryView from "../../src/tui/HistoryView.tsx";
import WatchlistView from "../../src/tui/WatchlistView.tsx";
import { DEFAULT_TLDS, EXTENDED_TLDS } from "../../src/checker/types.ts";
import { addHistory } from "../../src/config/history.ts";

const scenario = process.argv[2];
const opened: string[] = [];
mock.module("../../src/registrar/browser.ts", () => ({ openBrowser: (url: string) => { opened.push(url); } }));
if (scenario === "watch-corrupt" || scenario === "history-corrupt" || scenario === "history-save-failure") {
  const dir = join(process.env.TEMPER_TEST_HOME!, ".temper");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, scenario === "watch-corrupt" ? "watchlist.json" : "history.json"), "{}");
}
if (scenario?.startsWith("history-delete-")) {
  await addHistory({ query: "older", timestamp: new Date().toISOString(), available: 1, total: 1 });
  await addHistory({ query: "selected", timestamp: new Date().toISOString(), available: 1, total: 1 });
}
const unhandled: string[] = [];
process.on("unhandledRejection", (error) => unhandled.push(String(error)));
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
let started = 0;
let aborted = 0;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (String(input) === "https://data.iana.org/rdap/dns.json") {
    if (scenario === "bootstrap" || scenario === "suggest-bootstrap") throw new Error("test bootstrap unavailable");
    return Response.json({ services: [...EXTENDED_TLDS, "uk"].map((tld) => [[tld], [`https://${tld}.test/`]]) });
  }
  if (scenario === "suggest-cancel") {
    started++;
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => { aborted++; reject(init!.signal!.reason); }, { once: true });
    });
  }
  if (scenario === "search-partial" && String(input).endsWith("/acme.dev")) return new Response(null, { status: 400 });
  if (scenario === "suggest-partial" && String(input).endsWith("/getacme.com")) return new Response(null, { status: 400 });
  if (scenario === "suggest-uppercase" && String(input).endsWith("/acmeapp.com")) {
    return Response.json({ objectClassName: "domain", ldhName: "acmeapp.com" });
  }
  if (scenario?.startsWith("search-available-")) {
    const allowed = scenario.endsWith("none") ? [] : scenario.endsWith("one") ? ["acme.com"] : ["acme.com", "acme.dev", "acme.io"];
    const domain = String(input).split("/").at(-1)!;
    if (!allowed.includes(domain)) return Response.json({ objectClassName: "domain", ldhName: domain });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

let frame = "";
const output = new Writable({ write(chunk, _encoding, callback) { frame = String(chunk); callback(); } });
Object.assign(output, { columns: 110, rows: scenario?.startsWith("search-") ? 24 : 40, isTTY: true });
const input = new PassThrough();
Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
let back = 0;
const element = scenario === "suggest"
  ? <SuggestView query="Acme" prefixes={[]} suffixes={[]} onBack={() => back++} />
  : scenario === "watch-corrupt" ? <WatchlistView />
  : scenario === "history-corrupt" || scenario?.startsWith("history-delete-") ? <HistoryView />
  : scenario?.startsWith("suggest-") ? <SuggestView query="Acme" prefixes={["Get"]} suffixes={["App"]} />
  : scenario === "search-composite" ? <SearchView query="Acme" tlds={["uk", "co.uk"]} />
  : scenario?.startsWith("search-") ? <SearchView query="Acme" tlds={DEFAULT_TLDS} onlyAvailable={scenario.startsWith("search-available-")} />
  : <SearchView query="Acme" tlds={["com"]} />;
const view = render(element, {
  stdout: output as NodeJS.WriteStream, stderr: output as NodeJS.WriteStream,
  stdin: input as unknown as NodeJS.ReadStream, debug: true, patchConsole: false, exitOnCtrlC: false,
});
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(10);
  if (!predicate()) throw new Error(`Timed out: ${frame}`);
}
const frames: Record<string, string> = {};
const plain = () => frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
async function key(value: string) { input.write(value); await Bun.sleep(60); }
try {
  if (scenario?.startsWith("search-")) {
    await until(() => frame.includes("Search complete") || frame.includes("Partial results"));
    if (scenario === "search-filter" || scenario === "search-resize") {
      for (let i = 0; i < 20; i++) await key("j");
      frames.scrolled = plain();
    }
    if (scenario === "search-composite") {
      await key("/"); await key("co.uk"); await key("\r");
      frames.selected = plain();
      await key("a"); await until(() => frame.includes("Added acme.co.uk"));
      await key("i"); await until(() => frame.includes("whois acme.co.uk"));
      frames.detail = plain();
      await key("\x1b"); await key("\r");
      await until(() => frame.includes("Where to buy?")); frames.registrar = plain();
      await key("c");
    } else if (scenario === "search-partial") {
      frames.initial = plain();
      await key("/"); await key("dev"); await key("\r");
    } else if (scenario === "search-resize") {
      Object.assign(output, { rows: 40 }); output.emit("resize"); await Bun.sleep(80);
      frames.expanded = plain();
      Object.assign(output, { rows: 18 }); output.emit("resize"); await Bun.sleep(80);
      frames.shrunk = plain();
    } else if (scenario === "search-filter") {
      await key("/"); await key("com");
      frames.filtered = plain();
      await key("z"); frames.empty = plain();
      await key("\x7f"); frames.backspace = plain();
      for (let i = 0; i < 3; i++) await key("\x7f");
      frames.deleted = plain();
      await key("com");
      await key("z"); await key("\r");
      for (const value of ["j", "k", "a", "i", "\r"]) await key(value);
      frames.emptyActions = plain();
      await key("/"); await key("com"); await key("\r");
      frames.confirmed = plain();
      await key("a"); await until(() => frame.includes("Added acme.com"));
      await key("i"); await until(() => frame.includes("whois acme.com"));
      frames.detail = plain();
      await key("\x1b"); await key("\r");
      await until(() => frame.includes("Where to buy?")); frames.registrar = plain();
      await key("c");
      await key("/"); await key("com"); await key("\x1b"); frames.cleared = plain();
    } else {
      frames.available = plain();
      await key("j"); await key("k");
      if (scenario.endsWith("none")) {
        for (const value of ["a", "i", "\r"]) await key(value);
      }
      frames.afterNavigation = plain();
    }
  } else if (scenario === "suggest") {
    await until(() => frame.includes("1 names checked"));
    input.write("\r");
    await until(() => frame.includes("Search complete"));
    input.write("\x1b");
    await until(() => !frame.includes("temper search"));
  } else if (scenario === "suggest-cancel") {
    await until(() => started > 0);
    view.unmount();
    await until(() => aborted === started);
  } else if (scenario?.startsWith("suggest-")) {
    await until(() => frame.includes("3 names checked"));
  } else if (scenario === "history-delete-conflict") {
    await until(() => frame.includes("selected"));
    await addHistory({ query: "new", timestamp: new Date().toISOString(), available: 1, total: 1 });
    input.write("d");
    await until(() => frame.includes("History changed"));
  } else if (scenario === "history-delete-repeat") {
    await until(() => frame.includes("selected"));
    const lock = join(process.env.TEMPER_TEST_HOME!, ".temper/history.json.lock");
    await writeFile(lock, "test owner");
    input.write("d");
    await until(() => frame.includes("Deleting history"));
    input.write("d");
    await unlink(lock);
    await until(() => !frame.includes("selected") && !frame.includes("Deleting history"));
  } else if (scenario === "history-delete-failure") {
    await until(() => frame.includes("selected"));
    await writeFile(join(process.env.TEMPER_TEST_HOME!, ".temper/history.json"), "{}");
    input.write("d");
    await until(() => frame.includes("repair"));
  } else {
    await until(() => frame.includes("Search complete") || frame.includes("Search failed") || frame.includes("repair") || unhandled.length > 0);
  }
  const history = await readFile(join(process.env.TEMPER_TEST_HOME!, ".temper/history.json"), "utf8").catch(() => "[]");
  const watch = await readFile(join(process.env.TEMPER_TEST_HOME!, ".temper/watchlist.json"), "utf8").catch(() => "[]");
  const result = { frame: plain(), frames, opened, watch: JSON.parse(watch), back, unhandled, history: JSON.parse(history), started, aborted };
  view.unmount();
  view.cleanup();
  console.log(JSON.stringify(result));
} finally {
  view.unmount();
  view.cleanup();
}
