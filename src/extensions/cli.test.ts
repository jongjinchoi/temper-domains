import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension navigation exposes summary and separate facets without writing user data", async () => {
  const home = await mkdtemp(join(tmpdir(), "temper-extensions-"));
  try {
    const run = async (...args: string[]) => {
      const child = Bun.spawn([process.execPath, "--preload", "./tests/helpers/home.ts", "./src/index.ts", ...args], {
        env: { ...process.env, TEMPER_TEST_HOME: home }, stdout: "pipe", stderr: "pipe",
      });
      return { code: await child.exited, out: await new Response(child.stdout).text(), err: await new Response(child.stderr).text() };
    };
    const summary = await run("extensions", "--categories", "--format", "json");
    expect(summary.code).toBe(0);
    const overview = JSON.parse(summary.out);
    expect(overview.facets.map((f: { id: string }) => f.id)).toEqual(["industry", "purpose", "region"]);
    expect(overview).not.toHaveProperty("items");
    for (const facet of ["industry", "purpose", "region"]) {
      const result = await run("extensions", "--categories", facet, "--format", "json");
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out).categories.length).toBeGreaterThan(0);
    }
    const detail = await run("extensions", "--query", "co.uk", "--format", "json");
    expect(detail.code).toBe(0);
    expect(JSON.parse(detail.out).items.find((item: { suffix: string }) => item.suffix === "co.uk")).toBeDefined();
    for (const args of [["show-presets"], ["search", "acme", "--tld-preset", "tech"], ["extensions", "--categories", "invalid"]]) {
      expect((await run(...args)).code).not.toBe(0);
    }
    expect(await readdir(home)).toEqual([]);
  } finally { await rm(home, { recursive: true, force: true }); }
}, 15000);
