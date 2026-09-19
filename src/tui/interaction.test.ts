import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function scenario(name: string) {
  const home = await mkdtemp(join(tmpdir(), "temper-tui-"));
  try {
    const child = Bun.spawn([process.execPath, "tests/helpers/tui-worker.tsx", name], {
      cwd: import.meta.dir + "/../..", env: { ...process.env, TEMPER_TEST_HOME: home },
      stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    return JSON.parse(stdout);
  } finally { await rm(home, { recursive: true, force: true }); }
}

test("uppercase search renders the completed domain status", async () => {
  const result = await scenario("uppercase");
  expect(result.frame).toContain("acme.com");
  expect(result.frame).toContain("available");
  expect(result.frame).not.toContain("checking");
});

test("bootstrap failure becomes an error screen without a successful history entry", async () => {
  const result = await scenario("bootstrap");
  expect(result.unhandled).toEqual([]);
  expect(result.frame).toContain("Search failed");
  expect(result.frame).toContain("test bootstrap unavailable");
  expect(result.frame).not.toContain("Search complete");
  expect(result.history).toEqual([]);
});

test("escape from a suggestion search returns only to the suggestion list", async () => {
  const result = await scenario("suggest");
  expect(result.back).toBe(0);
  expect(result.frame).not.toContain("temper search");
  expect(result.frame).toContain("Acme");
});

test.each(["watch-corrupt", "history-corrupt"])("%s shows a repair message instead of rejecting outside the UI", async (name) => {
  const result = await scenario(name);
  expect(result.unhandled).toEqual([]);
  expect(result.frame).toContain("repair");
  expect(result.frame).toContain("not been overwritten");
});

test("uppercase suggestion names and affixes render their completed rows", async () => {
  const result = await scenario("suggest-uppercase");
  expect(result.frame).toMatch(/Acme\s+.*available/);
  expect(result.frame).toMatch(/GetAcme\s+.*available/);
  expect(result.frame).toMatch(/AcmeApp\s+.*taken/);
  expect(result.frame).not.toContain("checking");
  expect(result.unhandled).toEqual([]);
});

test("suggestion bootstrap failure renders terminal errors for uppercase candidates", async () => {
  const result = await scenario("suggest-bootstrap");
  expect(result.frame).toMatch(/Acme\s+.*error/);
  expect(result.frame).toMatch(/GetAcme\s+.*error/);
  expect(result.frame).not.toContain("checking");
});

test("history save failure preserves search results and shows a separate warning", async () => {
  const result = await scenario("history-save-failure");
  expect(result.frame).toContain("Search complete");
  expect(result.frame).toContain("available");
  expect(result.frame).toContain("History was not saved");
  expect(result.frame).not.toContain("Search failed");
  expect(result.history).toEqual({});
});

test("a stale history screen refreshes without deleting the selected or new entry", async () => {
  const result = await scenario("history-delete-conflict");
  expect(result.frame).toContain("History changed");
  expect(result.frame).toContain("selected");
  expect(result.frame).toContain("new");
  expect(result.history.map((entry: { query: string }) => entry.query)).toEqual(["new", "selected", "older"]);
  expect(result.unhandled).toEqual([]);
});

test("a partial suggestion failure does not hide completed rows", async () => {
  const result = await scenario("suggest-partial");
  expect(result.frame).toMatch(/Acme\s+.*available/);
  expect(result.frame).toMatch(/GetAcme\s+.*error/);
  expect(result.frame).toMatch(/AcmeApp\s+.*available/);
  expect(result.frame).not.toContain("checking");
});

test("leaving suggestions cancels running lookups without an unhandled rejection", async () => {
  const result = await scenario("suggest-cancel");
  expect(result.started).toBeGreaterThan(0);
  expect(result.aborted).toBe(result.started);
  expect(result.unhandled).toEqual([]);
});

test("repeated delete input during a pending write removes only the selected entry", async () => {
  const result = await scenario("history-delete-repeat");
  expect(result.history.map((entry: { query: string }) => entry.query)).toEqual(["older"]);
  expect(result.frame).toContain("older");
  expect(result.frame).not.toContain("selected");
  expect(result.unhandled).toEqual([]);
});

test("failed deletion leaves the displayed entries and damaged file intact", async () => {
  const result = await scenario("history-delete-failure");
  expect(result.history).toEqual({});
  expect(result.frame).toContain("repair");
  expect(result.frame).toContain("selected");
  expect(result.frame).toContain("older");
  expect(result.unhandled).toEqual([]);
});
