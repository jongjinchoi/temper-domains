import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Bun and Node CLI report storage failures and the cleanup needed before retry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-storage-cli-"));
  try {
    const output = join(dir, "build");
    const built = await Bun.build({ entrypoints: [resolve("src/index.ts")], outdir: output, target: "node", packages: "external", define: { PKG_VERSION: '"0.0.0"' } });
    expect(built.success).toBe(true);
    await symlink(resolve("node_modules"), join(dir, "node_modules"), "dir");
    for (const runtime of ["bun", "node"]) {
      const home = join(dir, runtime);
      await mkdir(join(home, ".temper"), { recursive: true });
      const watch = join(home, ".temper/watchlist.json");
      const config = join(home, ".temper/config.json");
      const run = async (args: string[], failure = "") => {
        const command = runtime === "bun"
          ? [process.execPath, "--preload", resolve("tests/helpers/storage-cli-preload.mjs"), resolve("src/index.ts")]
          : ["node", "--import", resolve("tests/helpers/storage-cli-preload.mjs"), join(output, "index.js")];
        const child = Bun.spawn([...command, ...args], { env: { ...process.env, TEMPER_TEST_HOME: home, TEMPER_STORAGE_FAILURE: failure }, stdout: "pipe", stderr: "pipe" });
        const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect(err).toContain(`storage-injected=${failure ? 1 : 0}`);
        return { code, out, err };
      };
      await writeFile(watch, "{");
      const invalid = await run(["watch", "acme.com"]);
      expect(invalid.code).toBe(1);
      expect(invalid.err).toContain("Invalid watchlist");
      expect(invalid.err).not.toContain("cleanup failed");
      expect(await readdir(join(home, ".temper"))).toEqual(["watchlist.json"]);
      const cleanup = await run(["watch", "acme.com"], "unlink");
      expect(cleanup.code).toBe(1);
      expect(cleanup.err).toContain("Invalid watchlist");
      expect(cleanup.err.match(/controlled lock unlink failure/g)).toHaveLength(1);
      expect(cleanup.err.match(/remove only/g)).toHaveLength(1);
      expect(cleanup.err).toContain(watch + ".lock");
      expect(await readFile(watch, "utf8")).toBe("{");
      expect(await Bun.file(watch + ".lock").exists()).toBe(true);
      // The child has exited; follow its recovery advice on this fixture only.
      await rm(watch + ".lock");
      await writeFile(watch, "[]");
      expect((await run(["watch", "acme.com"])).code).toBe(0);
      expect(JSON.parse(await readFile(watch, "utf8"))[0].domain).toBe("acme.com");

      await writeFile(config, '{"theme":"dracula"}');
      const pid = await run(["config", "theme", "seoul-night"], "lock-write");
      expect(pid.code).toBe(1);
      expect(pid.err).toContain("Config was not saved");
      expect(pid.err).toContain("controlled PID write failure");
      expect(pid.err).not.toContain("remove only");
      expect(await readFile(config, "utf8")).toBe('{"theme":"dracula"}');
      expect(await Bun.file(config + ".lock").exists()).toBe(false);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 15000);
