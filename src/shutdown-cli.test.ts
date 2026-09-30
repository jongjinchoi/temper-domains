import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// A JSON search interrupted by a signal must not leave the shared limit-state
// lock behind: a leftover lock makes every later lookup fail until it is removed.
test.skipIf(process.platform === "win32")("Bun and Node JSON searches interrupted by signals leave no limit-state lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-shutdown-cli-"));
  let delayMs = 400;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch() {
    await Bun.sleep(delayMs);
    return new Response("{}", { status: 404, headers: { "content-type": "application/rdap+json" } });
  } });
  try {
    const output = join(dir, "build");
    const built = await Bun.build({ entrypoints: [resolve("src/index.ts")], outdir: output, target: "node", packages: "external", define: { PKG_VERSION: '"0.0.0"' } });
    expect(built.success).toBe(true);
    await symlink(resolve("node_modules"), join(dir, "node_modules"), "dir");
    const preload = resolve("tests/limits/preload.mjs");
    for (const runtime of ["bun", "node"]) {
      const home = join(dir, runtime);
      const state = join(home, ".temper/state");
      const command = runtime === "bun" ? [process.execPath, "--preload", preload, resolve("src/index.ts")] : ["node", "--import", preload, join(output, "index.js")];
      const env = { ...process.env, TEMPER_LIMIT_TEST_HOME: home, TEMPER_LIMIT_TEST_ORIGIN: `http://127.0.0.1:${server.port}`, TEMPER_NO_UPDATE_CHECK: "1" };
      const search = () => Bun.spawn([...command, "search", "shutdowncheck", "--tlds", "com,net,org", "-f", "json"], { env, stdout: "pipe", stderr: "pipe" });
      const leftovers = async () => (await readdir(state).catch(() => [])).filter(name => name !== "lookup-limits.json");

      delayMs = 400;
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
        // Sweep the signal across startup, admission and the pending request.
        for (let wait = 0; wait <= 300; wait += 60) {
          const child = search();
          await Bun.sleep(wait);
          child.kill(signal);
          await child.exited;
          expect({ runtime, signal, wait, leftovers: await leftovers() }).toEqual({ runtime, signal, wait, leftovers: [] });
        }
      }

      // The next lookup in the same home still answers.
      delayMs = 0;
      const after = search();
      const [code, out] = await Promise.all([after.exited, new Response(after.stdout).text()]);
      expect(code).toBe(0);
      expect((JSON.parse(out) as { status: string; terminationReason?: string }[]).map(row => [row.status, row.terminationReason])).toEqual([["available", undefined], ["available", undefined], ["available", undefined]]);
    }
  } finally {
    server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
}, 120000);
