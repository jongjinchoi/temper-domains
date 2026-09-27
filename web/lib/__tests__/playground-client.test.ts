import { afterEach, expect, test } from "bun:test";
import { runLiveSearch } from "../playground-client.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

async function httpError(response: Response, signal = new AbortController().signal) {
  globalThis.fetch = (async () => response) as typeof fetch;
  const events: string[] = [];
  await runLiveSearch("example.com", {
    onRow: () => events.push("row"), onDone: () => events.push("done"),
    onError: message => events.push(message),
  }, signal);
  return events;
}

test.each(["invalid domain label", "invalid tlds"])("preserves the HTTP error explanation: %s", async error => {
  expect(await httpError(Response.json({ error: ` ${error} ` }, { status: 400 })))
    .toEqual([`HTTP 400: ${error}`]);
});

test.each(["<html>Bad gateway</html>", "{", "", "null", "[]", "42", '{"error":42}', '{"error":"   "}', '{}'])(
  "retains HTTP status for an unusable error body: %s", async body => {
    expect(await httpError(new Response(body, { status: 502 }))).toEqual(["HTTP 502"]);
  },
);

test("retains HTTP status when reading the error body fails", async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new Error("Read failed")); } });
  expect(await httpError(new Response(body, { status: 502 }))).toEqual(["HTTP 502"]);
});

test("retains the fallback for a successful response without a body", async () => {
  expect(await httpError(new Response(null, { status: 204 }))).toEqual(["HTTP 204"]);
});

test.each(["resolve", "reject"])("ignores an HTTP error body that settles after cancellation: %s", async mode => {
  const controller = new AbortController();
  const response = Response.json({ error: "invalid domain label" }, { status: 400 });
  let beginRead!: () => void;
  const reading = new Promise<void>(resolve => { beginRead = resolve; });
  let finishRead!: () => void;
  const gate = new Promise<void>(resolve => { finishRead = resolve; });
  response.json = async () => {
    beginRead();
    await gate;
    if (mode === "reject") throw new DOMException("Cancelled", "AbortError");
    return { error: "invalid domain label" };
  };
  const pending = httpError(response, controller.signal);
  // The race also lets the old implementation finish, so its callback is asserted below.
  await Promise.race([reading, pending]);
  controller.abort();
  finishRead();
  expect(await pending).toEqual([]);
});

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
