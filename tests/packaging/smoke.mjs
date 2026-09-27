// Exercise the exact release artifact outside the checkout, without domain lookups.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [kind, targetOrArchive, nativeArchive] = process.argv.slice(2);
assert.ok(kind === 'npm' || kind === 'native', 'Usage: smoke.mjs npm <tgz> | native <target> <tar.gz>');
const archive = resolve(kind === 'npm' ? targetOrArchive : nativeArchive);
const digest = () => createHash('sha256').update(readFileSync(archive)).digest('hex');
const before = digest();
const expectedVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const root = mkdtempSync(join(tmpdir(), 'temper-package-smoke-'));
const home = join(root, 'home');
mkdirSync(home);
const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home,
  APPDATA: home, LOCALAPPDATA: home, TEMPER_NO_UPDATE_CHECK: '1', NO_COLOR: '1' };
delete env.NODE_PATH;
delete env.FORCE_COLOR;
try {
  let executable;
  if (kind === 'npm') {
    // npm installation is local to the fixture; only its dependencies may be downloaded.
    execFileSync('npm', ['install', '--prefix', root, '--no-audit', '--no-fund', archive], {
      cwd: root, env, stdio: 'pipe', timeout: 120000,
    });
    executable = join(root, 'node_modules', '.bin', 'temper');
  } else {
    const platform = process.platform === 'win32' ? 'windows' : process.platform;
    assert.equal(targetOrArchive, `bun-${platform}-${process.arch}`, 'Native smoke must run on the target OS/CPU');
    execFileSync('tar', ['-xzf', archive, '-C', root], { cwd: root, env });
    executable = join(root, process.platform === 'win32' ? 'temper.exe' : 'temper');
  }
  const cli = args => {
    const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `Packaged CLI failed: ${args.join(' ')}\n${result.error ?? ''}\n${result.stderr}`);
    return result.stdout;
  };
  assert.equal(cli(['--version']).trim(), expectedVersion);
  assert.match(cli(['--help']), /Usage: temper/);
  assert.match(cli(['extensions', '--categories']), /Extension classifications/);
  assert.equal(digest(), before, 'Smoke must not modify the artifact that will be published');
  console.log(`PASS: ${kind} package version/help/offline catalog; SHA-256 ${before}`);
} finally { rmSync(root, { recursive: true, force: true }); }
