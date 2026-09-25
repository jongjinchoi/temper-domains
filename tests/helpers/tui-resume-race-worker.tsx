import "./home.ts";
import { PassThrough, Writable } from "node:stream";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";
import { render } from "ink";
import SearchView from "../../src/tui/SearchView.tsx";
import { SearchSession } from "../../src/tui/search-session.ts";
import type { DomainResult } from "../../src/checker/types.ts";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

const mode = process.argv[2];
const retiredCleanup = gate();
const activeResponse = gate();
const calls: string[][] = [];
const runs: Promise<void>[] = [];
const frames: Record<string, string> = {};
const unhandled: string[] = [];
process.on("unhandledRejection", error => unhandled.push(String(error)));
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

function result(domain: string, status: DomainResult["status"], terminationReason?: DomainResult["terminationReason"]): DomainResult {
  return { domain, tld: domain.split(".").at(-1)!, status, terminationReason, method: "rdap", responseTime: 1, attempts: 1 };
}

const session = new SearchSession("acme", ["com", "net"], undefined, async function* (domains, options) {
  const round = calls.push([...domains]);
  if (round === 1) {
    yield result("acme.com", "available");
    yield result("acme.net", "error", "network_error");
  } else if (round === 2) {
    // Cancellation changes the live session immediately; this old request can
    // finish cleaning up only after the test releases it on the next screen.
    await new Promise<void>(resolve => {
      if (options?.signal?.aborted) resolve();
      else options?.signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    await retiredCleanup.promise;
    yield result("acme.net", "slow", "cancelled");
  } else {
    await activeResponse.promise;
    if (mode === "error") throw new Error("Controlled resume failure");
    yield result("acme.net", "available");
  }
});

// Observe the real Promise without replacing the session's behavior.
const resume = session.resume.bind(session);
session.resume = domains => {
  const running = resume(domains);
  runs.push(running);
  return running;
};

let frame = "";
const output = new Writable({ write(chunk, _encoding, callback) {
  if (chunk.length) frame = String(chunk);
  callback();
} });
Object.assign(output, { columns: 110, rows: 24, isTTY: true });
const input = new PassThrough();
Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
const view = render(<SearchView query="acme" tlds={["com", "net"]} session={session} />, {
  stdout: output as NodeJS.WriteStream, stderr: output as NodeJS.WriteStream,
  stdin: input as unknown as NodeJS.ReadStream, debug: true, patchConsole: false, exitOnCtrlC: false,
});
const plain = () => frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
async function until(label: string, predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  do {
    await view.waitUntilRenderFlush();
    if (predicate()) return;
    await Bun.sleep(10);
  } while (Date.now() < deadline);
  throw new Error(`Timed out during ${label}: ${plain()}`);
}
async function key(value: string, label: string, predicate: () => boolean) {
  input.write(value);
  await until(label, predicate);
}
const confirmation = () => plain().includes("Resume 1 unresolved candidate once?");
const selecting = () => plain().includes("enter registrar");
const registrar = () => plain().includes("Where to check?");
const running = () => plain().includes("Resuming");

try {
  await until("initial partial results", () => session.getSnapshot().done && selecting());
  frames.initial = plain();
  await key("j", "select unresolved row", () => /▸\s+acme.net/.test(plain()));
  await key("r", "first confirmation", confirmation);
  await key("\r", "first resume", () => calls.length === 2 && running());
  await key("\x1b", "cancel first resume", () => session.getSnapshot().done && selecting());

  if (mode === "registrar") await key("\r", "open registrar", registrar);
  else {
    await key("r", "second confirmation", confirmation);
    if (mode === "running") await key("\r", "second resume", () => calls.length === 3 && running());
  }
  frames.beforeOldCompletion = plain();
  retiredCleanup.release();
  await runs[0];
  await view.waitUntilRenderFlush();
  frames.afterOldCompletion = plain();

  const preserved = mode === "registrar" ? registrar() : mode === "running" ? running() : confirmation();
  // Return the observed wrong screen for a direct assertion, rather than
  // hiding the regression behind a later timeout or changing the key sequence.
  if (preserved) {
    if (mode !== "running") {
      if (mode !== "confirmation") {
        await key("\x1b", "cancel retained screen", selecting);
        frames.dismissed = plain();
        await key("r", "confirm recovery", confirmation);
      }
      await key("\r", "recovery resume", () => calls.length === 3 && running());
    }
    activeResponse.release();
    await runs[1];
    await view.waitUntilRenderFlush();
    frames.final = plain();
  }
  const history = JSON.parse(await readFile(join(process.env.TEMPER_TEST_HOME!, ".temper/history.json"), "utf8"));
  console.log(JSON.stringify({ frames, calls, history, results: [...session.getSnapshot().results.values()], unhandled }));
} finally {
  session.cancel();
  retiredCleanup.release();
  activeResponse.release();
  await Promise.allSettled(runs);
  view.unmount();
  view.cleanup();
}
