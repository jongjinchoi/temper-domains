import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, mkdir, stat, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileLimitStore } from "./limit-store.ts";
import { LimitCoordinator, MemoryLimitStore, ServerCooldown, LimitStateError } from "./limits.ts";

const key = "https://limits.example";
const signal = () => AbortSignal.timeout(3000);

test("client backoff advances only on a new probe, caps with one jitter, then resets on success", async () => {
  let now = 100000;
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store, () => now, () => 1 - Number.EPSILON);
  for (const seconds of [60, 120, 240, 480, 900, 900]) {
    const permit = await limits.acquire(key, now + 10000, signal());
    const limited = await permit.limited("rate_limited");
    expect(Date.parse(limited.retryAt) - now).toBe(seconds * 1000 + 5000);
    await permit.release();
    const before = await store.update(s => JSON.stringify(s));
    await expect(limits.acquire(key, now + 100, signal())).rejects.toBeInstanceOf(ServerCooldown);
    expect(await store.update(s => JSON.stringify(s))).toBe(before);
    now = Date.parse(limited.retryAt);
  }
  const success = await limits.acquire(key, now + 10000, signal());
  await success.answered(); await success.release(); now += 300;
  const fresh = await limits.acquire(key, now + 10000, signal());
  expect(Date.parse((await fresh.limited("rate_limited")).retryAt) - now).toBe(65000);
  await fresh.release();
});

test("late parallel responses cannot shorten server cooldown, change its source, or increment strikes", async () => {
  let now = 100000;
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store, () => now, () => 0);
  const first = await limits.acquire(key, now + 10000, signal());
  now += 300;
  const second = await limits.acquire(key, now + 10000, signal());
  const day = await first.limited("rate_limited", 86400000);
  expect(await second.limited("rate_limited")).toEqual(day);
  await second.answered();
  expect(await store.update(s => s.servers[key]!.strikes)).toBe(1);
  await expect(limits.acquire(key, now + 100, signal())).rejects.toMatchObject({ source: "server", until: Date.parse(day.retryAt) });
  await first.release(); await second.release();
});

test("only one probe runs after cooldown across coordinators; cancellation releases waiting work", async () => {
  let now = Date.now();
  const store = new MemoryLimitStore();
  const a = new LimitCoordinator(store, () => now, () => 0);
  const b = new LimitCoordinator(store, () => now, () => 0);
  const first = await a.acquire(key, now + 1000, signal());
  now = Date.parse((await first.limited("rate_limited")).retryAt);
  await first.release();
  const probe = await a.acquire(key, now + 1000, signal());
  const cancel = new AbortController();
  const waiting = b.acquire(key, now + 1000, cancel.signal);
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(await store.update(s => s.servers[key]!.leases.length)).toBe(1);
  cancel.abort(); await expect(waiting).rejects.toHaveProperty("name", "AbortError");
  const other = await b.acquire("https://other.example", now + 1000, signal());
  await other.release();
  await probe.limited("rate_limited"); await probe.release();
  await expect(b.acquire(key, now + 100, signal())).rejects.toBeInstanceOf(ServerCooldown);
});

test("file state preserves cooldown across instances and keeps private atomic files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-limits-"));
  const path = join(dir, "state", "lookup-limits.json");
  const limits = new LimitCoordinator(new FileLimitStore(path));
  const permit = await limits.acquire(key, Date.now() + 10000.25, signal());
  const response = await permit.limited("rate_limited", 86400000);
  await permit.release();
  await expect(new LimitCoordinator(new FileLimitStore(path)).acquire(key, Date.now() + 1000, signal()))
    .rejects.toMatchObject({ until: Date.parse(response.retryAt), source: "server" });
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect((await readFile(path, "utf8"))).not.toContain("first.com");
});

test("corrupt and inaccessible state fails closed and does not replace evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-limits-"));
  const path = join(dir, "lookup-limits.json");
  await writeFile(path, "{broken");
  await expect(new FileLimitStore(path).update(() => {})).rejects.toBeInstanceOf(LimitStateError);
  expect(await readFile(path, "utf8")).toBe("{broken");
  await expect(new FileLimitStore(join(path, "child.json")).update(() => {})).rejects.toBeInstanceOf(LimitStateError);
  await mkdir(join(dir, "directory.json"));
  await expect(new FileLimitStore(join(dir, "directory.json")).update(() => {})).rejects.toBeInstanceOf(LimitStateError);
});

test("independent file store instances merge concurrent servers without lost updates", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "temper-limits-")), "limits.json");
  await Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const coordinator = new LimitCoordinator(new FileLimitStore(path));
    const permit = await coordinator.acquire(`https://${i}.example`, Date.now() + 5000, signal());
    await permit.limited("rate_limited", 86400000); await permit.release();
  }));
  const state = JSON.parse(await readFile(path, "utf8"));
  expect(Object.keys(state.servers)).toHaveLength(8);
  expect(Object.values(state.servers).every((s: any) => s.source === "server" && s.strikes === 1 && !s.leases.length)).toBe(true);
});

test("a busy lock fails closed, cancellation is prompt, and the lock is not removed", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "temper-limits-")), "limits.json");
  await writeFile(`${path}.lock`, "existing owner\n");
  const limits = new LimitCoordinator(new FileLimitStore(path));
  const start = Date.now();
  await expect(limits.acquire(key, Date.now() + 5000, AbortSignal.timeout(40))).rejects.toHaveProperty("name", "TimeoutError");
  expect(Date.now() - start).toBeLessThan(500);
  await expect(new FileLimitStore(path).update(() => {})).rejects.toThrow("confirming no temper process");
  expect(await readFile(`${path}.lock`, "utf8")).toBe("existing owner\n");
});

test("expired leases do not permanently block a new probe", async () => {
  let now = 100000;
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store, () => now, () => 0);
  const first = await limits.acquire(key, now + 100, signal());
  now = Date.parse((await first.limited("rate_limited")).retryAt);
  const replacement = await limits.acquire(key, now + 1000, signal());
  expect(await store.update(s => s.servers[key]!.leases.length)).toBe(1);
  await replacement.release();
});

test("state directory permissions are reported without dispatching or resetting state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-limits-permission-"));
  const path = join(dir, "limits.json");
  const limits = new LimitCoordinator(new FileLimitStore(path));
  const permit = await limits.acquire(key, Date.now() + 5000, signal());
  await permit.limited("rate_limited", 86400000);
  await permit.release();
  const before = await readFile(path, "utf8");
  await chmod(dir, 0o500);
  try {
    await expect(limits.acquire(key, Date.now() + 1000, signal())).rejects.toBeInstanceOf(LimitStateError);
    expect(await readFile(path, "utf8")).toBe(before);
  } finally { await chmod(dir, 0o700); }
});

test("a longer concurrent server wait replaces a shorter wait without another backoff step", async () => {
  const store = new MemoryLimitStore();
  const limits = new LimitCoordinator(store);
  const first = await limits.acquire(key, Date.now() + 5000, signal());
  const second = await limits.acquire(key, Date.now() + 5000, signal());
  await first.limited("rate_limited", 1000);
  const longer = await second.limited("rate_limited", 86400000);
  await first.answered();
  const state = await store.update(s => s.servers[key]!);
  expect(state.blockedUntil).toBe(Date.parse(longer.retryAt));
  expect(state.strikes).toBe(1);
  await first.release(); await second.release();
});
