import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("CLI and web refresh in long-lived processes using max-age minus Age", async () => {
  const home = await mkdtemp(join(tmpdir(), "temper-bootstrap-"));
  try {
    const proc = Bun.spawn([process.execPath, "tests/helpers/bootstrap-cache.ts"], {
      env: { ...process.env, TEMPER_TEST_HOME: home }, stdout: "pipe", stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    const result = JSON.parse(output);
    expect(result.cli).toBe("https://revision-2.test/");
    expect(result.web).toBe("https://revision-2.test/");
    expect(result.calls).toBe(4);
  } finally { await rm(home, { recursive: true, force: true }); }
});

import { afterEach } from "bun:test";
import { createBootstrapCache, parseBootstrap, type BootstrapSnapshot } from "./bootstrap-cache.ts";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const data: BootstrapSnapshot["data"] = { services: [[["com"], ["https://registry.test/"]]] };

test("revalidates with ETag and retains data after 304", async () => {
  let calls = 0;
  let sent: Headers | undefined;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    sent = new Headers(init?.headers);
    return ++calls === 1 ? Response.json(data, { headers: { "cache-control": "no-cache", etag: '"v1"' } })
      : new Response(null, { status: 304, headers: { "cache-control": "max-age=60" } });
  }) as unknown as typeof fetch;
  const cache = createBootstrapCache();
  await cache.get();
  expect((await cache.get()).get("com")).toBe("https://registry.test/");
  expect(sent?.get("if-none-match")).toBe('"v1"');
  await cache.get();
  expect(calls).toBe(2);
});

test("one shared refresh serves concurrent callers", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; await Bun.sleep(20); return Response.json(data); }) as unknown as typeof fetch;
  const cache = createBootstrapCache();
  const maps = await Promise.all([cache.get(), cache.get(), cache.get()]);
  expect(maps.every(map => map.get("com") === "https://registry.test/")).toBe(true);
  expect(calls).toBe(1);
});

test("invalid refresh does not replace saved data or serve prohibited stale data", async () => {
  let saved: BootstrapSnapshot | undefined;
  let calls = 0;
  globalThis.fetch = (async () => ++calls === 1
    ? Response.json(data, { headers: { "cache-control": "max-age=0, must-revalidate" } })
    : Response.json({ services: [[[], ["javascript:invalid"]]] })) as unknown as typeof fetch;
  const cache = createBootstrapCache({ async read() {}, async write(snapshot) { saved = snapshot; }, async remove() {} });
  await cache.get();
  await expect(cache.get()).rejects.toThrow("Invalid IANA bootstrap service");
  expect(saved?.data).toEqual(data);
});

test("legacy disk format is read and validated before replacement", async () => {
  let saved: BootstrapSnapshot | undefined;
  globalThis.fetch = (async () => Response.json(data, { headers: { "cache-control": "max-age=60" } })) as unknown as typeof fetch;
  const cache = createBootstrapCache({ async read() { return data; }, async write(snapshot) { saved = snapshot; }, async remove() {} });
  expect((await cache.get()).get("com")).toBe("https://registry.test/");
  expect(saved?.version).toBe(1);
});

test("no-store removes the old disk entry and does not retain the response", async () => {
  let removed = false;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json(data, { headers: { "cache-control": "no-store" } }); }) as unknown as typeof fetch;
  const cache = createBootstrapCache({ async read() { return data; }, async write() { throw new Error("must not persist"); }, async remove() { removed = true; } });
  await cache.get(); await cache.get();
  expect(removed).toBe(true);
  expect(calls).toBe(2);
});

test("HTTPS is preferred while preserving the other published endpoints", () => {
  const map = parseBootstrap({ services: [[["com"], ["http://registry.test/", "https://registry.test/", "https://other.test/"]]] });
  expect(map.get("com")).toBe("https://registry.test/");
  expect(map.endpoints.get("com")).toEqual(["https://registry.test/", "https://other.test/", "http://registry.test/"]);
});
