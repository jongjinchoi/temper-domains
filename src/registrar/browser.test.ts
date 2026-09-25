import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("Bun and Node browser requests report failure, acceptance and uncertainty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-browser-"));
  try {
    const file = join(dir, "browser.mjs");
    const build = await Bun.build({ entrypoints: ["src/registrar/browser.ts"], target: "node" });
    expect(build.success).toBe(true);
    await Bun.write(file, build.outputs[0]!);
    for (const runtime of [process.execPath, "node"]) {
      const child = Bun.spawn([runtime, "tests/runtime/browser-checks.mjs", file], { stdout: "pipe", stderr: "pipe" });
      const error = await new Response(child.stderr).text();
      expect(await child.exited, `${runtime}: ${error}`).toBe(0);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 15000);
