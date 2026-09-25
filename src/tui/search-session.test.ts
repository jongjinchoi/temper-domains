import { expect, test } from "bun:test";
import type { DomainResult } from "../checker/types.ts";
import { SearchSession } from "./search-session.ts";

const result = (domain: string, status: DomainResult["status"], attempts = 1): DomainResult => ({
  domain, tld: domain.split(".").at(-1)!, status, method: "rdap", responseTime: 1, attempts,
  ...(status === "rate_limited" ? { terminationReason: "server_cooldown" as const } : {}),
});
const history = { add: async () => {}, replace: async () => true };

test("session resumes only unresolved candidates and preserves original rows and cumulative attempts", async () => {
  const calls: string[][] = [];
  const session = new SearchSession("sample", ["com", "net"], undefined, async function* (domains) {
    calls.push([...domains]);
    if (calls.length === 1) { yield result("sample.com", "available"); yield result("sample.net", "rate_limited", 2); }
    else yield result("sample.net", "rate_limited", 0);
  }, history);
  await session.start();
  const original = session.getSnapshot().results.get("sample.com");
  expect(() => session.resume(["sample.com"])).toThrow();
  expect(() => session.resume(["invented.org"])).toThrow();
  expect(() => session.resume(["sample.net", "sample.net"])).toThrow();
  await session.resume(["sample.net"]);
  await session.start(); // Remount does not repeat the original search.
  expect(calls).toEqual([["sample.com", "sample.net"], ["sample.net"]]);
  expect(session.getSnapshot().results.get("sample.com")).toEqual(original);
  expect(session.getSnapshot().totalAttempts.get("sample.net")).toBe(2);
});

test("cancel preserves partial results and rejects late results from an older round", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let first!: () => void;
  const seen = new Promise<void>(resolve => { first = resolve; });
  const session = new SearchSession("sample", ["com", "net"], undefined, async function* () {
    if (++calls > 1) { yield result("sample.net", "taken"); return; }
    yield result("sample.com", "taken"); first(); await gate; yield result("sample.net", "available");
  }, history);
  const running = session.start(); await seen;
  session.cancel();
  expect(session.getSnapshot().results.get("sample.net")!.terminationReason).toBe("cancelled");
  await session.resume(["sample.net"]); release(); await running;
  expect(session.getSnapshot().results.get("sample.com")!.status).toBe("taken");
  expect(session.getSnapshot().results.get("sample.net")!.status).toBe("taken");
  expect(session.getSnapshot().totalAttempts.get("sample.net")).toBe(2);
  expect(session.getSnapshot().done).toBe(true);
});

test("all deferred candidates return without dispatch and a deleted history entry is not re-added", async () => {
  let calls = 0, adds = 0, replaces = 0;
  const session = new SearchSession("sample", ["com"], undefined, async function* () {
    calls++; yield { ...result("sample.com", "rate_limited"), retryAt: new Date(Date.now() + 86400000).toISOString() };
  }, { add: async () => { adds++; }, replace: async () => { replaces++; return false; } });
  await session.start();
  await session.resume(["sample.com"]);
  await session.resume(["sample.com"]);
  expect(calls).toBe(1); expect(adds).toBe(1); expect(replaces).toBe(1);
  expect(session.getSnapshot().done).toBe(true);
});
