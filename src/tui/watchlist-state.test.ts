import { expect, test } from "bun:test";
import type { DomainResult } from "../checker/types.ts";
import { initialWatchlistState, watchlistReducer, type WatchlistAction, type WatchlistState } from "./watchlist-state.ts";

const entry = (domain: string) => ({ domain, addedAt: "2026-09-27T00:00:00Z" });
const result = (domain: string): DomainResult => ({ domain, tld: "com", status: "available", method: "rdap", responseTime: 1, attempts: 1 });
const run = (actions: WatchlistAction[], state: WatchlistState = initialWatchlistState) => actions.reduce(watchlistReducer, state);
const loaded = (...domains: string[]) => run([{ type: "loaded", entries: domains.map(entry) }]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

test("a result queued before a deletion survives it", () => {
  const state = run([{ type: "result", result: result("b.com") }, { type: "removed", domain: "a.com" }], loaded("a.com", "b.com"));
  expect(state.items.map(item => [item.domain, item.status])).toEqual([["b.com", "available"]]);
});

test("replacing rows keeps the selected domain, or the same bounded position", () => {
  const selectedC = run([{ type: "move", delta: 2 }], loaded("a.com", "b.com", "c.com"));
  expect(run([{ type: "removed", domain: "a.com" }], selectedC)).toMatchObject({ cursor: 1 });
  const removedSelected = run([{ type: "removed", domain: "c.com" }], selectedC);
  expect(removedSelected.items[removedSelected.cursor]?.domain).toBe("b.com");
  expect(run([{ type: "removed", domain: "a.com" }], loaded("a.com")).cursor).toBe(0);
  expect(run([{ type: "move", delta: -1 }, { type: "move", delta: 5 }], loaded("a.com", "b.com")).cursor).toBe(1);
});

test("reconciliation keeps the latest row state and marks unknown rows", () => {
  const state = run([{ type: "result", result: result("a.com") },
    { type: "reconciled", entries: [entry("a.com"), entry("new.com")] }], loaded("a.com", "gone.com"));
  expect(state.items.map(item => [item.domain, item.status])).toEqual([["a.com", "available"], ["new.com", "error"]]);
});

test("a failed load reports inline over existing rows and blocks only an empty list", () => {
  const withRows = run([{ type: "loadFailed", error: "read failed", entriesLoaded: false }], loaded("a.com"));
  expect(withRows).toMatchObject({ loadError: null, actionError: "read failed" });
  expect(withRows.items[0]).toMatchObject({ status: "error", result: { error: "read failed" } });
  expect(run([{ type: "loadFailed", error: "read failed", entriesLoaded: false }])).toMatchObject({ loadError: "read failed", actionError: null });
  expect(run([{ type: "deleteFailed", error: "x" }, { type: "loadStarted", preserveActionError: true }]).actionError).toBe("x");
  expect(run([{ type: "deleteFailed", error: "x" }, { type: "loadStarted", preserveActionError: false }]).actionError).toBeNull();
  expect(run([{ type: "reloadFailed", error: "x" }]).actionError).toBe("x. Could not reload the watchlist; press r to retry.");
});

test("transitions are pure and never mutate the previous state", () => {
  const state = deepFreeze(run([{ type: "move", delta: 1 }], loaded("a.com", "b.com")));
  const actions: WatchlistAction[] = [
    { type: "result", result: result("a.com") }, { type: "removed", domain: "a.com" },
    { type: "reconciled", entries: [entry("b.com")] }, { type: "loadFailed", error: "e", entriesLoaded: true },
    { type: "move", delta: -1 }, { type: "loaded", entries: [entry("c.com")] },
  ];
  for (const action of actions) expect(watchlistReducer(state, action)).toEqual(watchlistReducer(state, action));
  expect(watchlistReducer(state, { type: "result", result: result("missing.com") })).toBe(state);
});
