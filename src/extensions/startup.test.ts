import { expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("light CLI paths and MCP initialization do not execute the catalog", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-startup-"));
  const client = new Client({ name: "startup-test", version: "1.0.0" });
  try {
    await symlink(resolve("node_modules"), join(dir, "node_modules"), "dir");
    const built = await Bun.build({ entrypoints: [resolve("src/index.ts")], outdir: dir,
      target: "node", packages: "external", splitting: true, define: { PKG_VERSION: '"0.0.0-test"' }, plugins: [{ name: "catalog-execution-sentinel", setup(build) {
        build.onLoad({ filter: /extensions[\\/]catalog\.ts$/ }, async args => ({
          contents: 'throw new Error("CATALOG_EXECUTED");\n' + await Bun.file(args.path).text(), loader: "ts",
        }));
        build.onLoad({ filter: /extensions[\\/]data[\\/]catalog\.json$/ }, () => {
          throw new Error('Full maintenance catalog must not be bundled into the CLI');
        });
      } }] });
    expect(built.success).toBe(true);
    const entry = join(dir, "index.js");
    // The home directory comes from USERPROFILE on Windows and from HOME elsewhere.
    const env = { ...process.env, HOME: dir, USERPROFILE: dir, TEMPER_NO_UPDATE_CHECK: "1" };
    for (const args of [["--version"], ["--help"], ["config", "theme", "--list"], ["watch", "acme.com"],
      ["search", "acme", "--format", "json", "--timeout", "0"],
      ["search", "acme", "--extended", "--format", "json", "--timeout", "0"]]) {
      const child = Bun.spawn(["node", entry, ...args], { env, stdout: "pipe", stderr: "pipe" });
      const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(error).not.toContain("CATALOG_EXECUTED");
      expect(code, error).toBe(args[0] === "search" ? 1 : 0);
      if (args[0] === "search") expect(error).toContain("invalid --timeout");
    }
    for (const args of [["extensions"], ["search", "acme", "--tlds", "com"], ["search", "acme", "--category", "design-arts"]]) {
      const child = Bun.spawn(["node", entry, ...args], { env, stdout: "pipe", stderr: "pipe" });
      expect(await new Response(child.stderr).text()).toContain("CATALOG_EXECUTED");
      expect(await child.exited).toBe(1);
    }
    await client.connect(new StdioClientTransport({ command: "node", args: [entry, "mcp"], env: env as Record<string, string> }));
    expect((await client.listTools()).tools).toHaveLength(7);
    const discovery = await client.callTool({ name: "list_supported_tlds", arguments: {} });
    expect(discovery.isError).toBe(true);
    expect(JSON.stringify(discovery.content)).toContain("CATALOG_EXECUTED");
  } finally { await client.close(); await rm(dir, { recursive: true, force: true }); }
}, 20000);
