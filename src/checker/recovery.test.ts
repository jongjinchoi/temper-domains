import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileLimitStore } from "./limit-store.ts";
import { LimitCoordinator, MemoryLimitStore } from "./limits.ts";
import { checkFullDomains } from "./checker.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
const key = "https://recovery.test";

test("an expired unanswered lease interrupts the recovery success streak", async () => {
  let now = 100000;
  const limits = new LimitCoordinator(new MemoryLimitStore(), () => now, () => 0);
  const first = await limits.acquire(key, now + 1000, signal);
  await first.limited("rate_limited", 0); await first.release();
  for (let i = 0; i < 7; i++) {
    now += 1200;
    const permit = await limits.acquire(key, now + 1000, signal);
    await permit.answered(); await permit.release();
  }
  now += 1200;
  await limits.acquire(key, now + 100, signal); // Simulate a process leaving no response/release.
  now += 31000;
  const replacement = await limits.acquire(key, now + 1000, signal);
  await replacement.answered(); await replacement.release();
  now += 1200;
  const next = await limits.acquire(key, now + 1000, signal);
  await next.release();
  expect(await limits.tryAcquire(key, now + 3000, signal)).toMatchObject({ wait: 1200 });
});

test("recovery requires consecutive answers and a stable observation window", async () => {
  let now = 100000;
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store, () => now, () => 0);
  const first = await limits.acquire(key, now + 10000, signal);
  await first.limited("rate_limited", 0); await first.release();
  expect(await limits.tryAcquire(key, now + 10000, signal)).toMatchObject({ wait: 1200 });
  for (let i = 0; i < 8; i++) {
    now += 1200;
    const permit = await limits.acquire(key, now + 1000, signal);
    await permit.answered(); await permit.release();
  }
  expect(await limits.tryAcquire(key, now + 10000, signal)).toMatchObject({ wait: 1200 });
  now = 131201;
  const recovered = await limits.acquire(key, now + 1000, signal);
  await recovered.answered(); await recovered.release();
  now += 1200;
  const next = await limits.acquire(key, now + 1000, signal);
  await next.release(); // Failure must break the next recovery streak.
  expect(await limits.tryAcquire(key, now + 10000, signal)).toMatchObject({ wait: 600 });
  expect(await store.update(s => s.servers[key]!.strikes)).toBe(1);
});

test("v1 migration preserves waits and refuses a live old lease without changing bytes", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "temper-recovery-")), "state.json");
  const until = Date.now() + 86400000;
  const old = { version: 1, servers: { [key]: { generation: 3, observedAt: 100, strikes: 2, blockedUntil: until, nextStart: until + 1,
    source: "server", kind: "rate_limited", leases: [{ id: "old", pid: process.pid, expires: until, generation: 3, probe: true }] } } };
  const raw = JSON.stringify(old);
  await writeFile(path, raw);
  await expect(new FileLimitStore(path).update(() => {})).rejects.toThrow("older Temper");
  expect(await readFile(path, "utf8")).toBe(raw);
  old.servers[key]!.leases = [];
  await writeFile(path, JSON.stringify(old));
  await expect(new LimitCoordinator(new FileLimitStore(path)).acquire(key, Date.now() + 1000, signal)).rejects.toMatchObject({ until });
  const current = JSON.parse(await readFile(path, "utf8"));
  expect(current.version).toBe(2);
  expect(current.servers[key]).toMatchObject({ blockedUntil: until, nextStart: until + 1, generation: 3, strikes: 2 });
});

test("automatic budget estimates include shared recovery spacing without reserving a lease", async () => {
  let now = 100000;
  const store = new MemoryLimitStore(), limits = new LimitCoordinator(store, () => now, () => 0);
  const first = await limits.acquire(key, now + 10000, signal);
  await first.limited("rate_limited", 0); await first.release();
  expect(await limits.estimateWait([key, key, key], signal)).toBe(3600);
  expect(await store.update(s => s.servers[key]!.leases.length)).toBe(0);
});

test("shared pacing does not occupy the only local slot while another server is ready", async () => {
  const blocked = `https://${crypto.randomUUID()}.test`;
  const ready = `https://${crypto.randomUUID()}.test`;
  const store = new MemoryLimitStore(), limits = new LimitCoordinator(store);
  const permit = await limits.acquire(blocked, Date.now() + 2000, signal);
  await permit.release();
  await store.update(s => { s.servers[blocked]!.nextStart = Date.now() + 450; });
  const order: string[] = [];
  globalThis.fetch = (async input => { order.push(String(input)); return new Response(null, { status: 404 }); }) as typeof fetch;
  const results = [];
  for await (const row of checkFullDomains(["a.com", "b.net"], { limits, concurrency: 1, timeoutMs: 2000,
    rdapUrls: new Map([["com", blocked], ["net", ready]]) })) results.push(row);
  expect(order[0]).toBe(`${ready}/domain/b.net`);
  expect(results.every(r => r.status === "available")).toBe(true);
});

test("resume stops a newly limited server even with zero Retry-After and continues other servers", async () => {
  const blocked = `https://${crypto.randomUUID()}.test`;
  const ready = `https://${crypto.randomUUID()}.test`;
  const requests: string[] = [];
  globalThis.fetch = (async input => {
    requests.push(String(input));
    return new Response(null, { status: String(input).startsWith(blocked) ? 429 : 404, headers: { "retry-after": "0" } });
  }) as typeof fetch;
  const results = [];
  for await (const row of checkFullDomains(["a.com", "b.com", "c.net"], { resume: true,
    limits: new LimitCoordinator(new MemoryLimitStore()), timeoutMs: 3000, rdapUrls: new Map([["com", blocked], ["net", ready]]) })) results.push(row);
  expect(requests.filter(r => r.startsWith(blocked))).toHaveLength(1);
  expect(results.find(r => r.domain === "b.com")).toMatchObject({ attempts: 0, terminationReason: "server_cooldown" });
  expect(results.find(r => r.domain === "a.com")).toMatchObject({ attempts: 1, httpStatus: 429 });
  expect(results.find(r => r.domain === "c.net")).toMatchObject({ status: "available", httpStatus: 404 });
  expect(results.find(r => r.domain === "c.net")!.checkedAt).toBeDefined();
});
