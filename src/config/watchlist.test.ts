import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
let file: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "temper-watch-"));
  await mkdir(join(home, ".temper"));
  file = join(home, ".temper", "watchlist.json");
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

function worker(operation: string, domain: string, gate = "", extraEnv: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "tests/helpers/watch-worker.ts", operation, domain, gate], {
    cwd: import.meta.dir + "/../..", env: { ...process.env, TEMPER_TEST_HOME: home, ...extraEnv },
    stdout: "pipe", stderr: "pipe",
  });
  return Promise.all([child.exited, new Response(child.stderr).text()]);
}

test("concurrent processes preserve every successful watch addition", async () => {
  const gate = join(home, "start");
  const workers = Array.from({ length: 12 }, (_, i) => worker("add", `name${i}.com`, gate));
  await writeFile(gate, "start");
  for (const [code, stderr] of await Promise.all(workers)) expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  const entries = JSON.parse(await readFile(file, "utf8"));
  expect(entries).toHaveLength(12);
  expect(new Set(entries.map((e: { domain: string }) => e.domain)).size).toBe(12);
  expect((await readdir(join(home, ".temper"))).sort()).toEqual(["watchlist.json"]);
});

test("concurrent removal does not overwrite unrelated additions", async () => {
  await writeFile(file, JSON.stringify([{ domain: "old.com", addedAt: "2026-01-01T00:00:00Z" }]));
  const gate = join(home, "start");
  const jobs = [worker("remove", "old.com", gate), ...Array.from({ length: 8 }, (_, i) => worker("add", `new${i}.com`, gate))];
  await writeFile(gate, "start");
  for (const [code] of await Promise.all(jobs)) expect(code).toBe(0);
  const entries = JSON.parse(await readFile(file, "utf8"));
  expect(entries).toHaveLength(8);
  expect(entries.some((e: { domain: string }) => e.domain === "old.com")).toBe(false);
});

test.each(["{", "{}", '[{"domain":42}]'])("preserves invalid watchlist content: %s", async (content) => {
  await writeFile(file, content);
  const [code, error] = await worker("add", "acme.com");
  expect(code).toBe(1);
  expect(error).toContain("watchlist");
  expect(await readFile(file, "utf8")).toBe(content);
});

test("watch additions and removals treat domain case consistently", async () => {
  await worker("add", "Acme.com");
  await worker("add", "acme.com");
  expect(JSON.parse(await readFile(file, "utf8"))).toHaveLength(1);
  await worker("remove", "ACME.COM");
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual([]);
});

test("failed replacement keeps the previous watchlist and releases temporary files", async () => {
  const content = '[{"domain":"old.com","addedAt":"2026-01-01T00:00:00Z"}]';
  await writeFile(file, content);
  const [code] = await worker("add", "acme.com", "", { TEMPER_TEST_FAIL_RENAME: "1" });
  expect(code).toBe(1);
  expect(await readFile(file, "utf8")).toBe(content);
  expect(await readdir(join(home, ".temper"))).toEqual(["watchlist.json"]);
});

test("an existing lock prevents writes until the owner releases it", async () => {
  const lock = file + ".lock";
  await writeFile(lock, "another writer");
  const pending = worker("add", "acme.com");
  await Bun.sleep(100);
  expect(await Bun.file(file).exists()).toBe(false);
  await rm(lock);
  expect((await pending)[0]).toBe(0);
  expect(JSON.parse(await readFile(file, "utf8"))).toHaveLength(1);
});

test("a lock timeout preserves the owner's lock and previous data", async () => {
  const content = '[{"domain":"old.com","addedAt":"2026-01-01T00:00:00Z"}]';
  await writeFile(file, content);
  await writeFile(file + ".lock", "another writer");
  const [code, error] = await worker("add", "acme.com");
  expect(code).toBe(1);
  expect(error).toContain("Watchlist is busy");
  expect(await readFile(file, "utf8")).toBe(content);
  expect(await readFile(file + ".lock", "utf8")).toBe("another writer");
}, 10000);

test.each(["config", "history"])("does not overwrite a damaged %s file", async (kind) => {
  const target = join(home, ".temper", `${kind}.json`);
  for (const content of ["{", kind === "config" ? '{"theme":42}' : "{}"]) {
    await writeFile(target, content);
    const [code] = await worker(kind, "");
    expect(code).toBe(1);
    expect(await readFile(target, "utf8")).toBe(content);
  }
});
