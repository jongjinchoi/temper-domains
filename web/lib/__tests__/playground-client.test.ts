import { afterEach, expect, test } from "bun:test";
import { runLiveSearch } from "../playground-client.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

async function stream(chunks: string[], signal = new AbortController().signal) {
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  }))) as typeof fetch;
  const events: string[] = [];
  await runLiveSearch("acme", {
    onRow: (row) => events.push(row.domain),
    onDone: () => events.push("done"),
    onError: () => events.push("error"),
  }, signal);
  return events;
}

const row = JSON.stringify({ domain: "acme.com", tld: "com", status: "available", method: "rdap", responseTime: 1 });
test("reports an incomplete response when EOF arrives without a terminal event", async () => {
  expect(await stream([row + "\n"])).toEqual(["acme.com", "error"]);
});
test("parses a final completion event without a trailing newline", async () => {
  expect(await stream([row + '\n{"done":true,"elapsed":1}'])).toEqual(["acme.com", "done"]);
});
test("dispatches only one terminal event and ignores trailing rows", async () => {
  expect(await stream(['{"error":"unavailable"}\n', row + '\n{"done":true,"elapsed":1}\n'])).toEqual(["error"]);
});
test("handles split JSON chunks", async () => {
  expect(await stream([row.slice(0, 10), row.slice(10) + '\n{"done":true,"elapsed":1}\n'])).toEqual(["acme.com", "done"]);
});
test("does not dispatch callbacks for an already cancelled request", async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await stream([row + '\n{"done":true,"elapsed":1}\n'], controller.signal)).toEqual([]);
});

test("passes partial lookup coverage with the terminal event", async () => {
  const summary = { requested: 15, attempted: 12, answered: 10, unresolved: 5, elapsedMs: 3000 };
  globalThis.fetch = (async () => new Response(JSON.stringify({ done: true, elapsed: 3000, summary }) + "\n")) as unknown as typeof fetch;
  let received: unknown;
  await runLiveSearch("acme", { onRow() {}, onError() {}, onDone(_elapsed, coverage) { received = coverage; } }, new AbortController().signal);
  expect(received).toEqual(summary);
});
