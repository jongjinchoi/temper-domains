import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Bun and Node lookup/detail preserve policy outcomes and storage diagnostics without dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "temper-lookup-storage-"));
  try {
    const source = resolve("tests/helpers/storage-lookup-worker.ts");
    const build = join(directory, "build");
    expect((await Bun.build({ entrypoints: [source], outdir: build, target: "node" })).success).toBe(true);
    for (const [runtime, entry] of [[process.execPath, source], ["node", join(build, "storage-lookup-worker.js")]]) {
      const child = Bun.spawn([runtime!, entry!, join(directory, runtime === "node" ? "node" : "bun")], { stdout: "pipe", stderr: "pipe" });
      const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
      const result = JSON.parse(stdout);
      expect(result).toMatchObject({ injected: 8, network: 0, lock: false });
      expect(result.rows).toHaveLength(8);
      for (const { failure, until, row } of result.rows) {
        expect(row.attempts).toBe(0);
        if (failure === "close") {
          expect(row).toMatchObject({ status: "rate_limited", terminationReason: "server_cooldown", retryAtSource: "server", retryAt: new Date(until).toISOString() });
          expect(row.error).toContain("Previous server limit");
          expect(row.error.match(/lookup cleanup failed/g)).toHaveLength(1);
        } else {
          expect(row).toMatchObject({ status: "error", terminationReason: "limit_state_error" });
          expect(row.error).toContain("was not saved");
          expect(row.error.match(/PID storage failed/g)).toHaveLength(1);
        }
        expect(row.error).not.toContain("remove only");
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 15000);
