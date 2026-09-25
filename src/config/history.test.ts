import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
let file: string;
const entry = (query: string) => ({ query, timestamp: "2026-09-20T00:00:00Z", available: 1, total: 1 });
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "temper-history-"));
  await mkdir(join(home, ".temper"));
  file = join(home, ".temper/history.json");
});
afterEach(() => rm(home, { recursive: true, force: true }));
function worker(operation: string, query = "acme", gate = "", extraEnv: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "tests/helpers/history-worker.ts", operation, query, gate], {
    cwd: import.meta.dir + "/../..", env: { ...process.env, TEMPER_TEST_HOME: home, ...extraEnv }, stdout: "pipe", stderr: "pipe",
  });
  return Promise.all([child.exited, new Response(child.stderr).text()]);
}
const entries = async () => JSON.parse(await readFile(file, "utf8")) as ReturnType<typeof entry>[];

test("resume replaces only its exact history entry and never resurrects missing or ambiguous entries", async () => {
  for (const original of [[entry("other"), entry("selected")], [entry("other")], [entry("selected"), entry("selected")]]) {
    await writeFile(file, JSON.stringify(original));
    expect((await worker("replace", "selected"))[0]).toBe(0);
    const saved = await entries();
    if (original.length === 2 && original[0]!.query === "other") {
      expect(saved).toEqual([entry("other"), { ...entry("selected"), available: 0 }]);
    } else expect(saved).toEqual(original);
  }
});

test("separate processes preserve every successful history addition", async () => {
  const gate = join(home, "start");
  const jobs = Array.from({ length: 12 }, (_, i) => worker("add", `name${i}`, gate));
  await writeFile(gate, "go");
  for (const [code, stderr] of await Promise.all(jobs)) expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect((await entries()).map(e => e.query).sort()).toEqual(Array.from({ length: 12 }, (_, i) => `name${i}`).sort());
  expect(await readdir(join(home, ".temper"))).toEqual(["history.json"]);
});

test("deletion rejects a stale screen snapshot without deleting a different entry", async () => {
  await writeFile(file, JSON.stringify([entry("selected"), entry("older")]));
  const [code, error] = await worker("stale-delete");
  expect(code).toBe(1);
  expect(error).toContain("History changed");
  expect((await entries()).map(e => e.query)).toEqual(["new", "selected", "older"]);
});

test("a successful deletion and concurrent additions preserve unrelated entries", async () => {
  await writeFile(file, JSON.stringify([entry("selected"), entry("older")]));
  const gate = join(home, "start");
  const deleting = worker("delete", "selected", gate);
  const adding = Array.from({ length: 6 }, (_, i) => worker("add", `new${i}`, gate));
  await writeFile(gate, "go");
  for (const [code] of await Promise.all(adding)) expect(code).toBe(0);
  const [code, error] = await deleting;
  const names = (await entries()).map(e => e.query);
  for (let i = 0; i < 6; i++) expect(names).toContain(`new${i}`);
  expect(names).toContain("older");
  if (code !== 0) {
    expect(error).toContain("History changed");
    expect(names).toContain("selected");
  } else expect(names).not.toContain("selected");
});

test("new additions retain the newest 100 entries in order", async () => {
  await writeFile(file, JSON.stringify(Array.from({ length: 100 }, (_, i) => entry(`old${i}`))));
  expect((await worker("add", "new"))[0]).toBe(0);
  const saved = await entries();
  expect(saved).toHaveLength(100);
  expect(saved[0]!.query).toBe("new");
  expect(saved[99]!.query).toBe("old98");
});

test("failed replacement preserves history and cleans up owned temporary files", async () => {
  const content = JSON.stringify([entry("old")]);
  await writeFile(file, content);
  const [code] = await worker("add", "new", "", { TEMPER_TEST_FAIL_RENAME: "1" });
  expect(code).toBe(1);
  expect(await readFile(file, "utf8")).toBe(content);
  expect(await readdir(join(home, ".temper"))).toEqual(["history.json"]);
});

test("an existing history lock prevents writes until it is released", async () => {
  await writeFile(file, "[]");
  await writeFile(file + ".lock", "owner");
  const pending = worker("add");
  await Bun.sleep(100);
  const before = await readFile(file, "utf8");
  await rm(file + ".lock");
  expect((await pending)[0]).toBe(0);
  expect(before).toBe("[]");
  expect(await entries()).toHaveLength(1);
});

test("lock timeout leaves the owner's lock and history intact", async () => {
  await writeFile(file, "[]");
  await writeFile(file + ".lock", "owner");
  const [code, error] = await worker("add");
  expect(code).toBe(1);
  expect(error).toContain("History is busy");
  expect(await readFile(file, "utf8")).toBe("[]");
  expect(await readFile(file + ".lock", "utf8")).toBe("owner");
}, 10000);

test("damaged history is preserved and the writer releases its lock", async () => {
  await writeFile(file, "{}");
  expect((await worker("add"))[0]).toBe(1);
  expect(await readFile(file, "utf8")).toBe("{}");
  expect(await readdir(join(home, ".temper"))).toEqual(["history.json"]);
});
