import "./home.ts";
import { PassThrough, Writable } from "node:stream";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";
import { render } from "ink";
import SearchView from "../../src/tui/SearchView.tsx";
import SuggestView from "../../src/tui/SuggestView.tsx";
import HistoryView from "../../src/tui/HistoryView.tsx";
import WatchlistView from "../../src/tui/WatchlistView.tsx";
import { EXTENDED_TLDS } from "../../src/checker/types.ts";

const scenario = process.argv[2];
if (scenario === "watch-corrupt" || scenario === "history-corrupt") {
  const dir = join(process.env.TEMPER_TEST_HOME!, ".temper");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, scenario === "watch-corrupt" ? "watchlist.json" : "history.json"), "{}");
}
const unhandled: string[] = [];
process.on("unhandledRejection", (error) => unhandled.push(String(error)));
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
  if (String(input) === "https://data.iana.org/rdap/dns.json") {
    if (scenario === "bootstrap") throw new Error("test bootstrap unavailable");
    return Response.json({ services: EXTENDED_TLDS.map((tld) => [[tld], [`https://${tld}.test/`]]) });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

let frame = "";
const output = new Writable({ write(chunk, _encoding, callback) { frame = String(chunk); callback(); } });
Object.assign(output, { columns: 110, rows: 40, isTTY: true });
const input = new PassThrough();
Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
let back = 0;
const element = scenario === "suggest"
  ? <SuggestView query="acme" prefixes={[]} suffixes={[]} onBack={() => back++} />
  : scenario === "watch-corrupt" ? <WatchlistView />
  : scenario === "history-corrupt" ? <HistoryView />
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
try {
  if (scenario === "suggest") {
    await until(() => frame.includes("1 names checked"));
    input.write("\r");
    await until(() => frame.includes("Search complete"));
    input.write("\x1b");
    await until(() => !frame.includes("temper search"));
  } else {
    await until(() => frame.includes("Search complete") || frame.includes("Search failed") || frame.includes("repair") || unhandled.length > 0);
  }
  const history = await readFile(join(process.env.TEMPER_TEST_HOME!, ".temper/history.json"), "utf8").catch(() => "[]");
  const result = { frame: frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ""), back, unhandled, history: JSON.parse(history) };
  view.unmount();
  view.cleanup();
  console.log(JSON.stringify(result));
} finally {
  view.unmount();
  view.cleanup();
}
