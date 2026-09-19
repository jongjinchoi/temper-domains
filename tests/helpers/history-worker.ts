import "./home.ts";
import { mock } from "bun:test";
import * as fs from "node:fs/promises";

if (process.env.TEMPER_TEST_FAIL_RENAME) {
  mock.module("node:fs/promises", () => ({ ...fs, rename: async () => { throw new Error("test rename failed"); } }));
}
const { addHistory, loadHistory, removeHistoryAt } = await import("../../src/config/history.ts");
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
  if (operation === "stale-delete") {
    const snapshot = await loadHistory();
    await addHistory(entry("new"));
    await removeHistoryAt(0, snapshot);
  } else if (operation === "delete") {
    const snapshot = await loadHistory();
    await removeHistoryAt(snapshot.findIndex(e => e.query === query), snapshot);
  } else {
    await addHistory(entry(query!));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
