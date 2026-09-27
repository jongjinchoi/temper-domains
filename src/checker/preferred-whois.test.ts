import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let directory: string;
const source = resolve("tests/helpers/preferred-whois-worker.ts");
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "temper-preferred-whois-"));
  expect((await Bun.build({ entrypoints: [source], outdir: directory, target: "node" })).success).toBe(true);
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
for (const scenario of ["batch", "detail", "mixed", "mixed-success", "cancel", "deadline"]) {
  test(`preferred WHOIS ${scenario} is independent of bootstrap in Bun and Node`, async () => {
    for (const runtime of [process.execPath, "node"]) {
      const entry = runtime === "node" ? join(directory, "preferred-whois-worker.js") : source;
      const child = Bun.spawn([runtime, entry, join(directory, `${scenario}-${runtime === "node" ? "node" : "bun"}`), scenario], { stdout: "pipe", stderr: "pipe" });
      const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
      expect(stdout).toContain(`PASS ${scenario}`);
    }
  }, 10000);
}
