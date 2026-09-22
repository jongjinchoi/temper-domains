import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectInstallation } from "./installation.ts";
import type { Invocation } from "./process.ts";

const homes: string[] = [];
afterEach(async () => { await Promise.all(homes.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "temper-installation-")); homes.push(home);
  const prefix = join(home, "prefix"); const root = join(prefix, "lib", "node_modules");
  const entry = join(root, "temper-domains", "dist", "npm", "index.js");
  await mkdir(join(root, "temper-domains", "dist", "npm"), { recursive: true });
  await writeFile(entry, "");
  await writeFile(join(root, "temper-domains", "package.json"), JSON.stringify({ name: "temper-domains", bin: { temper: "./dist/npm/index.js" } }));
  return { home, prefix, root, entry };
}

test("npm updates require ownership of the running package, not npm presence", async () => {
  const f = await fixture();
  const npm = { file: process.execPath, args: [join(f.home, "npm-cli.js")] };
  const query = async (cmd: Invocation) => ({ stdout: cmd.args.includes("root") ? f.root : f.prefix, stderr: "" });
  const installation = await detectInstallation({ entry: f.entry, node: process.execPath, npm, brew: null, query, signal: AbortSignal.timeout(1000) });
  expect(installation.kind).toBe("npm");
  expect(installation.entry).toBe(await realpath(f.entry));
  const other = await detectInstallation({ entry: f.entry, node: process.execPath, npm, brew: null, query: async () => ({ stdout: join(f.home, "unrelated"), stderr: "" }), signal: AbortSignal.timeout(1000) });
  expect(other.kind).toBe("manual");
  expect(other.guidance).toContain("project");
});

test("npx cached entry is guidance-only even if npm is available", async () => {
  const f = await fixture();
  const entry = join(f.home, "_npx", "hash", "node_modules", "temper-domains", "dist", "npm", "index.js");
  await mkdir(join(entry, ".."), { recursive: true }); await writeFile(entry, "");
  await writeFile(join(entry, "..", "..", "..", "package.json"), JSON.stringify({ name: "temper-domains", bin: { temper: "./dist/npm/index.js" } }));
  const result = await detectInstallation({ entry, node: process.execPath, npm: null, brew: null, signal: AbortSignal.timeout(1000) });
  expect(result.kind).toBe("manual");
  expect(result.guidance).toContain("npx -y temper-domains@latest");
});

test("Homebrew detection requires both the expected tap and active keg entry", async () => {
  const f = await fixture();
  const keg = join(f.home, "Cellar", "temper", "0.4.1"); const entry = join(keg, "bin", "temper");
  await mkdir(join(keg, "bin"), { recursive: true }); await writeFile(entry, "");
  const info = { formulae: [{ name: "temper", full_name: "jongjinchoi/temper-domains/temper", tap: "jongjinchoi/temper-domains", pinned: false, versions: { stable: "0.5.0" }, installed: [{ version: "0.4.1" }] }] };
  const query = async (cmd: Invocation) => ({ stdout: cmd.args.includes("info") ? JSON.stringify(info) : cmd.args.includes("--cellar") ? join(f.home, "Cellar", "temper") : keg, stderr: "" });
  const result = await detectInstallation({ entry, node: null, npm: null, brew: "/test/brew", query, signal: AbortSignal.timeout(1000) });
  expect(result.kind).toBe("homebrew");
  info.formulae[0]!.tap = "different/tap";
  expect((await detectInstallation({ entry, node: null, npm: null, brew: "/test/brew", query, signal: AbortSignal.timeout(1000) })).kind).toBe("manual");
});
