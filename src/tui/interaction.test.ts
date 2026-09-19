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
  expect(result.frame).toContain("acme");
});

test.each(["watch-corrupt", "history-corrupt"])("%s shows a repair message instead of rejecting outside the UI", async (name) => {
  const result = await scenario(name);
  expect(result.unhandled).toEqual([]);
  expect(result.frame).toContain("repair");
  expect(result.frame).toContain("not been overwritten");
});
