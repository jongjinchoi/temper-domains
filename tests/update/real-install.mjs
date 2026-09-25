// Opt-in real installations in a new, retained temporary root. Never run in bun test.
// Homebrew: TEMPER_REAL_INSTALL=1 node tests/update/real-install.mjs homebrew <brew-source> <0.6.1-arm64-archive> <sha256>
// npm: TEMPER_REAL_INSTALL=1 node tests/update/real-install.mjs npm
// The starting code is this checkout built with a 0.6.0 TEST version; the target is published 0.6.1.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.env.TEMPER_REAL_INSTALL, "1", "Explicit opt-in required; this test installs real packages in a temporary prefix");
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [channel, brewSource, archive, expectedHash] = process.argv.slice(2);
assert.ok(channel === "homebrew" || channel === "npm");
const root = await realpath(await mkdtemp(join(tmpdir(), "temper-real-update-")));
console.log(`Retained evidence: ${root}`);
const home = join(root, "home");
await mkdir(join(home, ".temper"), { recursive: true });
await writeFile(join(home, ".temper/config.json"), JSON.stringify({ theme: process.env.TEMPER_TEST_THEME ?? "temper-forge", registrar: "cloudflare" }));
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), TERM: "xterm-256color", COLORTERM: "truecolor", FORCE_COLOR: "3", npm_config_cache: join(root, "npm-cache") };
for (const name of ["CI", "CONTINUOUS_INTEGRATION", "BUILD_NUMBER", "TEMPER_NO_UPDATE_CHECK", "NO_COLOR", "NODE_OPTIONS"]) delete env[name];
async function run(file, args, options = {}) {
  const child = spawn(file, args, { cwd: checkout, env, ...options, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", text => { stdout += text; });
  child.stderr.setEncoding("utf8").on("data", text => { stderr += text; });
  const code = await new Promise((yes, no) => { child.on("error", no); child.on("close", yes); });
  await writeFile(join(root, "setup.log"), `$ ${file} ${args.join(" ")}\n${stdout}${stderr}`, { flag: "a" });
  if (code !== 0) throw new Error(`${file} exited ${code}\n${stdout}\n${stderr}`);
  return stdout.trim();
}
const git = (args, cwd) => run("git", args, { cwd });
async function commit(cwd, message) {
  await git(["add", "."], cwd);
  await git(["-c", "user.name=Temper test", "-c", "user.email=test@example.invalid", "commit", "-qm", message], cwd);
}
let command;
let server;
const sourceHashes = {};
for (const path of (await git(["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src"], checkout)).split("\0").filter(Boolean).sort()) {
  sourceHashes[path] = createHash("sha256").update(await readFile(join(checkout, path))).digest("hex");
}
try {
  if (channel === "homebrew") {
    assert.equal(process.platform, "darwin"); assert.equal(process.arch, "arm64");
    assert.ok(brewSource && archive && /^[a-f0-9]{64}$/.test(expectedHash ?? ""));
    const targetBytes = await readFile(archive);
    assert.equal(createHash("sha256").update(targetBytes).digest("hex"), expectedHash);
    const brewRoot = join(root, "brew");
    await run("git", ["clone", "-q", "--shared", resolve(brewSource), brewRoot]);
    const rubyVersion = (await readFile(join(brewRoot, "Library/Homebrew/vendor/portable-ruby-version"), "utf8")).trim();
    const rubyRoot = join(brewRoot, "Library/Homebrew/vendor/portable-ruby");
    await mkdir(rubyRoot, { recursive: true });
    await cp(join(brewSource, "Library/Homebrew/vendor/portable-ruby", rubyVersion), join(rubyRoot, rubyVersion), { recursive: true });
    await symlink(rubyVersion, join(rubyRoot, "current"));
    Object.assign(env, { HOMEBREW_TEMP: join(root, "build"), HOMEBREW_CACHE: join(root, "cache"), HOMEBREW_LOGS: join(root, "logs"), HOMEBREW_NO_AUTO_UPDATE: "1", HOMEBREW_NO_ANALYTICS: "1", HOMEBREW_NO_INSTALL_FROM_API: "1", HOMEBREW_NO_ENV_HINTS: "1", PATH: `${brewRoot}/bin:${env.PATH}` });
    await mkdir(env.HOMEBREW_TEMP, { recursive: true });
    const source = join(root, "source"); await mkdir(source);
    await run("bun", ["build", "--compile", "--define", 'PKG_VERSION="0.6.0"', "src/index.ts", "--outfile", join(source, "temper")]);
    const startArchive = join(root, "start.tar.gz");
    await run("tar", ["-czf", startArchive, "-C", source, "temper"]);
    const startBytes = await readFile(startArchive);
    const bodies = new Map([["/start.tar.gz", startBytes], ["/target.tar.gz", targetBytes]]);
    server = createServer((req, res) => { const body = bodies.get(req.url); if (!body) return res.writeHead(404).end(); res.writeHead(200, { "Content-Length": body.length }); res.end(body); });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const formula = (version, path, bytes) => `class Temper < Formula\n  desc "Disposable real updater fixture"\n  homepage "https://github.com/jongjinchoi/temper-domains"\n  url "http://127.0.0.1:${port}/${path}"\n  version "${version}"\n  sha256 "${createHash("sha256").update(bytes).digest("hex")}"\n  def install\n    bin.install "temper"\n  end\nend\n`;
    const remote = join(root, "tap-remote"); await mkdir(join(remote, "Formula"), { recursive: true });
    await git(["init", "-qb", "main"], remote);
    await writeFile(join(remote, "Formula/temper.rb"), formula("0.6.0", "start.tar.gz", startBytes));
    await commit(remote, "test starting installation");
    const tap = join(brewRoot, "Library/Taps/jongjinchoi/homebrew-temper-domains");
    await run("git", ["clone", "-q", remote, tap]);
    // Empty official core avoids unrelated API/core bootstrap in this local fixture.
    const core = join(brewRoot, "Library/Taps/homebrew/homebrew-core");
    await mkdir(core, { recursive: true }); await git(["init", "-qb", "main"], core);
    await git(["-c", "user.name=Temper test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "isolated core"], core);
    await git(["remote", "add", "origin", core], core);
    await git(["fetch", "-q", "origin"], core);
    if (process.env.TEMPER_TEST_UNTRUSTED_TAPS === "1") {
      for (const name of ["getsentry/tools", "stripe/stripe-cli", "supabase/tap"]) {
        const [owner, repo] = name.split("/");
        const path = join(brewRoot, "Library/Taps", owner, `homebrew-${repo}`);
        await mkdir(path, { recursive: true });
        await git(["init", "-qb", "main"], path);
        await git(["-c", "user.name=Temper test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "isolated untrusted tap"], path);
        await git(["remote", "add", "origin", path], path);
        await git(["fetch", "-q", "origin"], path);
      }
    }
    const brew = join(brewRoot, "bin/brew");
    await run(brew, ["trust", "--formula", "jongjinchoi/temper-domains/temper"]);
    await run(brew, ["install", "--formula", "jongjinchoi/temper-domains/temper", "--quiet"]);
    await writeFile(join(remote, "Formula/temper.rb"), formula("0.6.1", "target.tar.gz", targetBytes));
    await commit(remote, "test published target mirror");
    await run(brew, ["info", "--json=v2", "--formula", "jongjinchoi/temper-domains/temper"]);
    command = [join(brewRoot, "bin/temper")];
  } else {
    const prefix = join(root, "npm-prefix");
    const pkg = JSON.parse(await readFile(join(checkout, "package.json"), "utf8"));
    const staging = join(root, "package"); await mkdir(join(staging, "dist/npm"), { recursive: true });
    await run("bun", ["build", "src/index.ts", "--target=node", "--packages=external", "--define", 'PKG_VERSION="0.6.0"', "--outfile", join(staging, "dist/npm/index.js")]);
    await writeFile(join(staging, "package.json"), JSON.stringify({ name: pkg.name, version: "0.6.0", type: "module", bin: pkg.bin, dependencies: pkg.dependencies, files: ["dist/npm"] }));
    const packed = JSON.parse(await run("npm", ["pack", "--json", "--ignore-scripts"], { cwd: staging }))[0].filename;
    await run("npm", ["install", "--global", "--prefix", prefix, join(staging, packed), "--no-audit", "--no-fund"]);
    Object.assign(env, { npm_config_prefix: prefix, PATH: `${prefix}/bin:${env.PATH}` });
    command = [process.execPath, join(prefix, "lib/node_modules/temper-domains/dist/npm/index.js")];
  }
  await writeFile(join(root, "session.json"), JSON.stringify({ command, env }, null, 2), { mode: 0o600 });
  console.log(`Starting actual ${channel} CLI update; source version is test-only 0.6.0`);
  if (process.env.TEMPER_TEST_INTERACTIVE === "1") {
    assert.ok(process.stdin.isTTY && process.stdout.isTTY, "Live mode requires a terminal");
    console.log("LIVE isolated installation. Select Update now to install, or Later to leave it unchanged.");
    const child = spawn(command[0], command.slice(1), { cwd: checkout, env, stdio: "inherit" });
    const code = await new Promise((yes, no) => { child.on("error", no); child.on("close", yes); });
    assert.equal(code, 0, "Live CLI did not exit successfully");
  } else {
    await run("python3", ["tests/update/real-cli-pty.py", root]);
  }
  const after = await run(command[0], [...command.slice(1), "--version"]);
  assert.equal(after, "0.6.1");
  await writeFile(join(root, "result.json"), JSON.stringify({ channel, checkout, sourceCommit: await git(["rev-parse", "HEAD"], checkout), sourceHashes, startVersion: "0.6.0 (test define)", installed: after, archiveSHA256: expectedHash ?? null }, null, 2));
  console.log(`Real ${channel} update verified: ${after}; ${root}`);
} finally { server?.close(); }
