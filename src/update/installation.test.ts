import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectInstallation, type Installation } from "./installation.ts";
import { checkForUpdate } from "./check.ts";
import { updateCommands } from "./runner.ts";
import type { Invocation } from "./process.ts";

const homes: string[] = [];
// Couple the CLI reference to real detection, discovery and command selection outcomes.
async function documentedSupport(installation: Installation, label: string) {
  const readme = await readFile(new URL('../../docs/cli.md', import.meta.url), 'utf8');
  const cells = readme.split('\n').find(line => line.startsWith(`| ${label} |`))?.split('|').slice(1, -1).map(cell => cell.trim());
  expect(cells, `CLI reference support row: ${label}`).toBeDefined();
  const calls: string[] = [];
  const result = await checkForUpdate(false, { entry: installation.entry, current: '0.1.0', detect: async () => installation,
    latest: async channel => { calls.push(channel); return '1.0.0'; } });
  expect(calls).toEqual(installation.channel ? [installation.channel] : []);
  expect(result?.latest).toBe(installation.channel ? '1.0.0' : null);
  if (calls.length) expect(cells![1]!.toLowerCase().split(' / ')).toContain(calls[0]! === 'homebrew' ? 'homebrew tap' : calls[0]!);
  else expect(cells![1]).toBe('None');
  expect(cells![2]).toBe(updateCommands(installation, '1.0.0').length ? 'After terminal confirmation' : 'Manual guidance only');
}
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
  await documentedSupport(installation, 'Verified global npm / Homebrew');
  const other = await detectInstallation({ entry: f.entry, node: process.execPath, npm, brew: null, query: async () => ({ stdout: join(f.home, "unrelated"), stderr: "" }), signal: AbortSignal.timeout(1000) });
  expect(other.kind).toBe("manual");
  expect(other.guidance).toContain("project");
  await documentedSupport(other, 'Local / linked / npx cache package');
});

test("npx cached entry is guidance-only even if npm is available", async () => {
  const f = await fixture();
  const entry = join(f.home, "_npx", "hash", "node_modules", "temper-domains", "dist", "npm", "index.js");
  await mkdir(join(entry, ".."), { recursive: true }); await writeFile(entry, "");
  await writeFile(join(entry, "..", "..", "..", "package.json"), JSON.stringify({ name: "temper-domains", bin: { temper: "./dist/npm/index.js" } }));
  const result = await detectInstallation({ entry, node: process.execPath, npm: null, brew: null, signal: AbortSignal.timeout(1000) });
  expect(result.kind).toBe("manual");
  expect(result.guidance).toContain("npx -y temper-domains@latest");
  await documentedSupport(result, 'Local / linked / npx cache package');
});

test("Homebrew detection requires both the expected tap and active keg entry", async () => {
  const f = await fixture();
  const keg = join(f.home, "Cellar", "temper", "0.4.1"); const entry = join(keg, "bin", "temper");
  await mkdir(join(keg, "bin"), { recursive: true }); await writeFile(entry, "");
  const info = { formulae: [{ name: "temper", full_name: "jongjinchoi/temper-domains/temper", tap: "jongjinchoi/temper-domains", pinned: false, versions: { stable: "0.5.0" }, installed: [{ version: "0.4.1" }] }] };
  const query = async (cmd: Invocation) => ({ stdout: cmd.args.includes("info") ? JSON.stringify(info) : cmd.args.includes("--cellar") ? join(f.home, "Cellar", "temper") : keg, stderr: "" });
  const result = await detectInstallation({ entry, node: null, npm: null, brew: "/test/brew", query, signal: AbortSignal.timeout(1000) });
  expect(result.kind).toBe("homebrew");
  await documentedSupport(result, 'Verified global npm / Homebrew');
  info.formulae[0]!.tap = "different/tap";
  expect((await detectInstallation({ entry, node: null, npm: null, brew: "/test/brew", query, signal: AbortSignal.timeout(1000) })).kind).toBe("manual");
});

test('source checkout and unidentified binary skip version queries; linked package retains npm guidance', async () => {
  const f = await fixture();
  const source = join(f.root, 'temper-domains', 'src', 'index.ts');
  await mkdir(join(source, '..')); await writeFile(source, '');
  const unknown = join(f.home, 'downloaded-temper'); await writeFile(unknown, '');
  for (const entry of [source, unknown]) {
    const result = await detectInstallation({ entry, npm: null, brew: null, node: null, signal: AbortSignal.timeout(1000) });
    expect(result.kind).toBe('manual'); expect(result.channel).toBeUndefined();
    await documentedSupport(result, 'Source checkout / unidentified binary without a release channel');
  }
  const global = join(f.home, 'global'); await mkdir(global);
  await symlink(join(f.root, 'temper-domains'), join(global, 'temper-domains'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await detectInstallation({ entry: f.entry, node: process.execPath, npm: { file: process.execPath, args: ['npm'] }, brew: null,
    query: async command => ({ stdout: command.args.includes('root') ? global : f.home, stderr: '' }), signal: AbortSignal.timeout(1000) });
  expect(result.kind).toBe('manual'); expect(result.channel).toBe('npm');
  await documentedSupport(result, 'Local / linked / npx cache package');
});
