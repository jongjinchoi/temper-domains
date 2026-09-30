import { expectPermit } from "../../tests/helpers/limit-admission.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileLimitStore } from "./limit-store.ts";
import { LimitCoordinator, MemoryLimitStore } from "./limits.ts";
import { checkFullDomains } from "./checker.ts";
import { rdapLookup } from "./rdap.ts";
import { createRequestScope } from "./scheduler.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
const key = "https://recovery.test";

test("one answer after repeated limits preserves the 2400ms admission boundary", async () => {
  let now = 100000;
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store, () => now, () => 0);
  const first = await expectPermit(limits.tryAcquire(key, now + 10000, signal));
  await first.limited("rate_limited", 0); await first.release();
  now += 1200;
  const second = await expectPermit(limits.tryAcquire(key, now + 10000, signal));
  await second.limited("rate_limited", 0); await second.release();
  now += 2400;
  const recovered = await expectPermit(limits.tryAcquire(key, now + 10000, signal));
  await recovered.answered(); await recovered.release();
  expect(await store.update(state => state.servers[key])).toMatchObject({
    level: 3, recovery: true, strikes: 2, successes: 1, leases: [],
  });
  now += 2399;
  expect(await limits.tryAcquire(key, now + 10000, signal)).toEqual({ wait: 1 });
  now++;
  const admission = await limits.tryAcquire(key, now + 10000, signal);
  expect(admission.permit).toBeDefined();
  await admission.permit!.release();
});

test("an expired unanswered lease interrupts the recovery success streak", async () => {
  let now = 100000;
  const limits = new LimitCoordinator(new MemoryLimitStore(), () => now, () => 0);
  const first = await expectPermit(limits.tryAcquire(key, now + 1000, signal));
  await first.limited("rate_limited", 0); await first.release();
  for (let i = 0; i < 7; i++) {
    now += 1200;
    const permit = await expectPermit(limits.tryAcquire(key, now + 1000, signal));
    await permit.answered(); await permit.release();
  }
  now += 1200;
  await expectPermit(limits.tryAcquire(key, now + 100, signal)); // Simulate a process leaving no response/release.
  now += 31000;
  const replacement = await expectPermit(limits.tryAcquire(key, now + 1000, signal));
  await replacement.answered(); await replacement.release();
  now += 1200;
  const next = await expectPermit(limits.tryAcquire(key, now + 1000, signal));
  await next.release();
  expect(await limits.tryAcquire(key, now + 3000, signal)).toMatchObject({ wait: 1200 });
});

test("recovery requires consecutive answers and a stable observation window", async () => {
  let now = 100000;
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store, () => now, () => 0);
  const first = await expectPermit(limits.tryAcquire(key, now + 10000, signal));
  await first.limited("rate_limited", 0); await first.release();
  expect(await limits.tryAcquire(key, now + 10000, signal)).toMatchObject({ wait: 1200 });
  for (let i = 0; i < 8; i++) {
    now += 1200;
    const permit = await expectPermit(limits.tryAcquire(key, now + 1000, signal));
    await permit.answered(); await permit.release();
  }
  expect(await limits.tryAcquire(key, now + 10000, signal)).toMatchObject({ wait: 1200 });
  now = 131201;
  const recovered = await expectPermit(limits.tryAcquire(key, now + 1000, signal));
  await recovered.answered(); await recovered.release();
  now += 1200;
  const next = await expectPermit(limits.tryAcquire(key, now + 1000, signal));
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
  await expect(new LimitCoordinator(new FileLimitStore(path)).tryAcquire(key, Date.now() + 1000, signal)).rejects.toMatchObject({ until });
  const current = JSON.parse(await readFile(path, "utf8"));
  expect(current.version).toBe(2);
  expect(current.servers[key]).toMatchObject({ blockedUntil: until, nextStart: until + 1, generation: 3, strikes: 2 });
});

test("automatic budget estimates include shared recovery spacing without reserving a lease", async () => {
  let now = 100000;
  const store = new MemoryLimitStore(), limits = new LimitCoordinator(store, () => now, () => 0);
  const first = await expectPermit(limits.tryAcquire(key, now + 10000, signal));
  await first.limited("rate_limited", 0); await first.release();
  expect(await limits.estimateWait([key, key, key], signal)).toBe(3600);
  expect(await store.update(s => s.servers[key]!.leases.length)).toBe(0);
});

test("shared pacing does not occupy the only local slot while another server is ready", async () => {
  const blocked = `https://${crypto.randomUUID()}.test`;
  const ready = `https://${crypto.randomUUID()}.test`;
  const store = new MemoryLimitStore(), limits = new LimitCoordinator(store);
  const permit = await expectPermit(limits.tryAcquire(blocked, Date.now() + 2000, signal));
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

// An accepted redirect is a valid answer from the redirecting server; a rejected one is an error.
async function recoverThroughRedirects(mode: "direct" | "other-server" | "same-server" | "rejected") {
  let now = 1_000_000;
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store, () => now, () => 0);
  const origin = `https://redirect-recovery-${mode}.test`;
  const limited = await expectPermit(limits.tryAcquire(origin, now + 10000, signal));
  await limited.limited("rate_limited", 0); await limited.release();
  globalThis.fetch = (async input => {
    const url = String(input);
    now += 3000; // each request takes simulated time, so pacing between hops can elapse
    if (mode === "other-server" && url.startsWith(origin)) return new Response(null, { status: 302, headers: { location: "https://redirect-target.test/domain/example.com" } });
    if (mode === "same-server" && !url.includes("/v2/")) return new Response(null, { status: 302, headers: { location: `${origin}/v2/domain/example.com` } });
    if (mode === "rejected" && url.includes("rejected.com")) return new Response(null, { status: 302, headers: { location: "http://redirect-target.test/domain/example.com" } });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const statuses: string[] = [];
  const lookup = async (domain: string) => {
    now += 5000;
    statuses.push((await rdapLookup(domain, origin, signal, { limits, scope: createRequestScope(1), deadline: Date.now() + 10000, requestTimeoutMs: 5000 })).status);
  };
  for (let index = 0; index < 12; index++) await lookup(mode === "rejected" && index === 5 ? "rejected.com" : `name${index}.com`);
  const entry = (await store.update(state => state.servers[origin]))!;
  return { statuses, level: entry.level, successes: entry.successes };
}

test("servers that answer with accepted redirects recover like servers that answer directly", async () => {
  const direct = await recoverThroughRedirects("direct");
  expect(direct).toMatchObject({ level: 1, successes: 4 });
  expect(direct.statuses).toEqual(Array(12).fill("available"));
  expect(await recoverThroughRedirects("other-server")).toEqual(direct);
  const sameServer = await recoverThroughRedirects("same-server");
  expect(sameServer.statuses).toEqual(direct.statuses);
  expect(sameServer.level).toBeLessThan(2);
}, 30000);

test("a rejected redirect interrupts the recovery streak", async () => {
  // Five answers, one rejected redirect, then six answers: the streak restarts at the rejection.
  const result = await recoverThroughRedirects("rejected");
  expect(result.statuses.filter(status => status === "error")).toHaveLength(1);
  expect(result).toMatchObject({ level: 2, successes: 6 });
}, 30000);
