// Real processes and filesystem, fake package manager. Never installs a package.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { detectInstallation, npmInvocation } from "../../src/update/installation.ts";
import { runProcess } from "../../src/update/process.ts";
import { performUpdate } from "../../src/update/runner.ts";
import { checkForUpdate } from "../../src/update/check.ts";
import { UpdateCheckError, updateCheckFailureMessage } from "../../src/update/errors.ts";
import { fetchLatestVersion } from "../../src/update/versions.ts";

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
  if (args.join('|') !== ${JSON.stringify(["install", "--global", "--prefix", prefix, "temper-domains@0.5.0", "--loglevel=warn", "--no-progress"].join("|"))}) throw new Error('Unexpected install target');
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
  const lockDirectory = join(home, "cache");
  let requests = 0;
  const checkOptions = { current: "0.4.1", entry, lockDirectory, detect: async () => installation, latest: async () => { requests++; return "0.5.0"; } };
  assert.equal((await checkForUpdate(true, checkOptions))?.latest, "0.5.0");
  assert.equal((await checkForUpdate(true, checkOptions))?.latest, "0.5.0");
  assert.equal(requests, 2);
  const denied = Object.assign(new Error("private installation path"), { code: "EACCES" });
  let failure: unknown;
  assert.equal(await checkForUpdate(true, { ...checkOptions, detect: async () => { throw denied; }, onFailure: error => { failure = error; } }), null);
  assert.ok(failure instanceof UpdateCheckError);
  assert.equal(failure.stage, "installation"); assert.equal(failure.cause, denied);
  assert.match(updateCheckFailureMessage(failure), /installation.*EACCES/i);
  assert.doesNotMatch(updateCheckFailureMessage(failure), /private/);
  await assert.rejects(checkForUpdate(false, { ...checkOptions,
    latest: (channel, signal) => fetchLatestVersion(channel, signal, async () => new Response("private body", { status: 503 })),
  }), error => error instanceof UpdateCheckError && error.stage === "version" && error.httpStatus === 503 && /HTTP 503/.test(error.message));
  for (const phase of ["installation", "version"] as const) {
    let reason: unknown;
    const waiting = (signal: AbortSignal): Promise<never> => new Promise((_, reject) => signal.addEventListener("abort", () => {
      reason = signal.reason; reject(new DOMException("Aborted", "AbortError"));
    }, { once: true }));
    assert.equal(await checkForUpdate(true, { ...checkOptions, automaticTimeout: 25,
      ...(phase === "installation" ? { detect: waiting } : { latest: (_channel: string, signal: AbortSignal) => waiting(signal) }),
      onFailure: error => { failure = error; },
    }), null);
    assert.ok(failure instanceof UpdateCheckError);
    assert.equal(failure.kind, "timeout"); assert.equal(failure.stage, phase); assert.equal(failure, reason);
  }
  const controller = new AbortController();
  const ready = join(home, "query-pid");
  let queryPid = 0;
  const pending = performUpdate(installation, "0.5.0", { lockDirectory: home, signal: controller.signal,
    query: async (_command, options) => runProcess({ file: process.execPath, args: ["-e",
      `require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));setInterval(()=>{},1000)`] }, options),
    execute: async () => { throw new Error("Cancelled preflight must not install"); }, confirmTarget: async () => true,
  });
  const deadline = Date.now() + 5000;
  while (!queryPid && Date.now() < deadline) {
    queryPid = Number(await readFile(ready, "utf8").catch(() => "0"));
    if (!queryPid) await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(queryPid, "Preflight child did not start");
  controller.abort();
  assert.deepEqual(await pending, { status: "cancelled" });
  assert.throws(() => process.kill(queryPid, 0), { code: "ESRCH" });
  assert.equal((await readdir(home)).some(name => name.endsWith(".lock")), false);
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
