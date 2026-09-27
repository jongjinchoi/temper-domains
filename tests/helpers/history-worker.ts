import "./home.ts";
import { mock } from "bun:test";
import * as fs from "node:fs/promises";

let failCleanup = false;
let injected = 0;
if (process.argv[2] === "conflict-cleanup") {
  const original = { ...fs };
  mock.module("node:fs/promises", () => ({ ...original, open: async (...args: Parameters<typeof fs.open>) => {
    const handle = await original.open(...args);
    if (String(args[0]).endsWith(".lock")) {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close();
        if (failCleanup) { injected++; throw new Error("history lock close failed"); }
      };
    }
    return handle;
  } }));
}

if (process.env.TEMPER_TEST_FAIL_RENAME) {
  mock.module("node:fs/promises", () => ({ ...fs, rename: async () => { throw new Error("test rename failed"); } }));
}
const { addHistory, loadHistory, removeHistoryAt, replaceHistoryEntry } = await import("../../src/config/history.ts");
const [operation, query, gate] = process.argv.slice(2);
const entry = (name: string) => ({ query: name, timestamp: "2026-09-20T00:00:00Z", available: 1, total: 1 });
if (gate) {
  const deadline = Date.now() + 3000;
  while (!(await Bun.file(gate).exists())) {
    if (Date.now() >= deadline) throw new Error("Test start gate timed out");
    await Bun.sleep(5);
  }
}
try {
  if (operation === "replace") {
    const expected = entry(query!);
    await replaceHistoryEntry(expected, { ...expected, available: 0 });
  } else if (operation === "stale-delete" || operation === "conflict-cleanup") {
    const snapshot = await loadHistory();
    await addHistory(entry("new"));
    failCleanup = true;
    await removeHistoryAt(0, snapshot);
  } else if (operation === "delete") {
    const snapshot = await loadHistory();
    await removeHistoryAt(snapshot.findIndex(e => e.query === query), snapshot);
  } else {
    await addHistory(entry(query!));
  }
} catch (error) {
  if (operation === "conflict-cleanup") {
    const conflict = error as Error & { current: unknown };
    console.error(JSON.stringify({ kind: conflict.name, message: conflict.message, current: conflict.current,
      injected, cleanup: conflict.cause instanceof AggregateError ? conflict.cause.errors.map(String) : undefined }));
  } else console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
