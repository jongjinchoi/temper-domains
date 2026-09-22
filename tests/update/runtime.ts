// Real processes and filesystem, fake package manager. Never installs a package.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { detectInstallation, npmInvocation } from "../../src/update/installation.ts";
import { runProcess } from "../../src/update/process.ts";
import { performUpdate } from "../../src/update/runner.ts";
import { checkForUpdate } from "../../src/update/check.ts";

const directory = await mkdtemp(join(tmpdir(), "temper-updater-runtime-"));
const home = await realpath(directory);
const oldPath = process.env.PATH;
try {
  const prefix = join(home, "prefix");
  const root = process.platform === "win32" ? join(prefix, "node_modules") : join(prefix, "lib", "node_modules");
  const bin = process.platform === "win32" ? prefix : join(prefix, "bin");
  const packageRoot = join(root, "temper-domains");
  const entry = join(packageRoot, "dist", "npm", "index.js");
  const npmRoot = join(root, "npm");
  const npmEntry = join(npmRoot, "bin", "npm-cli.js");
  const log = join(home, "commands.jsonl");
  await mkdir(join(packageRoot, "dist", "npm"), { recursive: true });
  await mkdir(join(npmRoot, "bin"), { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "temper-domains", bin: { temper: "./dist/npm/index.js" } }));
  await writeFile(entry, 'console.log("0.4.1");\n');
  await writeFile(join(npmRoot, "package.json"), JSON.stringify({ name: "npm" }));
  await writeFile(npmEntry, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.join(' ') === 'root --global') console.log(${JSON.stringify(root)});
else if (args.join(' ') === 'prefix --global') console.log(${JSON.stringify(prefix)});
else if (args[0] === 'install') {
  if (args.join('|') !== ${JSON.stringify(["install", "--global", "--prefix", prefix, "temper-domains@0.5.0"].join("|"))}) throw new Error('Unexpected install target');
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
  fs.writeFileSync(${JSON.stringify(entry)}, 'console.log("0.5.0");\\n');
} else throw new Error('Unexpected npm command');
`, { mode: 0o755 });
  if (process.platform === "win32") await writeFile(join(bin, "npm.cmd"), "@echo fake wrapper; must never be executed\r\n");
  else await symlink(npmEntry, join(bin, "npm"));
  process.env.PATH = `${bin}${delimiter}${oldPath ?? ""}`;
  const npm = await npmInvocation(process.execPath);
  assert.ok(npm);
  assert.equal(npm.args[0], npmEntry);
  const installation = await detectInstallation({ entry, node: process.execPath, npm, brew: null, signal: AbortSignal.timeout(5000) });
  assert.equal(installation.kind, "npm");
  const cacheFile = join(home, "cache", "update.json");
  let requests = 0;
  const checkOptions = { current: "0.4.1", entry, cacheFile, detect: async () => installation, latest: async () => { requests++; return "0.5.0"; } };
  assert.equal((await checkForUpdate(true, checkOptions))?.latest, "0.5.0");
  assert.equal((await checkForUpdate(true, checkOptions))?.latest, "0.5.0");
  assert.equal(requests, 1);
  const result = await performUpdate(installation, "0.5.0", { lockDirectory: home, confirmTarget: async () => { throw new Error("npm must not change the approved target"); }, execute: async command => { await runProcess(command); } });
  assert.deepEqual(result, { status: "updated", version: "0.5.0" });
  assert.equal((await runProcess({ file: process.execPath, args: [entry, "--version"] })).stdout.trim(), "0.5.0");
  assert.equal((await readFile(log, "utf8")).trim().split("\n").length, 1);
  assert.deepEqual(await performUpdate(installation, "0.5.0", { lockDirectory: home, confirmTarget: async () => true }), { status: "current", version: "0.5.0" });
  await assert.rejects(runProcess({ file: process.execPath, args: ["-e", "process.exit(7)"] }), /7/);
  await assert.rejects(runProcess({ file: join(home, "missing"), args: [] }));
  await assert.rejects(runProcess({ file: process.execPath, args: ["-e", "setTimeout(()=>{},10000)"] }, { signal: AbortSignal.timeout(50) }));
  console.log(`Updater filesystem/process contracts passed (${process.platform}, ${process.versions.bun ? "Bun " + process.versions.bun : "Node " + process.versions.node}); fake installer only.`);
} finally {
  process.env.PATH = oldPath;
  await rm(directory, { recursive: true, force: true });
}
