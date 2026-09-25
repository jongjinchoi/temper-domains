import { test, expect } from 'bun:test';
import { collectSource, permittedSource, nativeBinaryName, verifyNativeIdentity } from './source-package.ts';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('source snapshot allows build inputs but excludes secrets and installed dependencies', () => {
  for (const path of ['build-npm.ts', 'bun.lock', 'src/index.ts', 'web/next.config.mjs', '.github/workflows/release.yml', 'data-sources/catalog/roots.txt']) expect(permittedSource(path)).toBe(true);
  for (const path of ['.env', 'web/.env.production', 'web/node_modules/react/index.js', 'web/.next/server.js', '.vercel/project.json', 'web/.vercel/project.json', 'web/.vercel/output/config.json', '../secret', '/etc/passwd', 'web/key.pem', 'notes/private.md']) expect(permittedSource(path)).toBe(false);
});

test('source collection works without Git or release metadata, and public scope ignores unrelated notes', () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-source-scope-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const revisions = { GITHUB_SHA: process.env.GITHUB_SHA, VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA };
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'package.json'), '{"version":"1.0.0"}');
    writeFileSync(join(root, 'src/index.ts'), 'console.log("hello")');
    expect(collectSource(root).paths).toEqual(['package.json', 'src/index.ts']);
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.'); git('commit', '-m', 'fixture');
    // This public-build fixture deploys its own commit, not the CI checkout.
    const revision = git('rev-parse', 'HEAD').toString().trim();
    process.env.GITHUB_SHA = revision;
    process.env.VERCEL_GIT_COMMIT_SHA = revision;
    const initial = collectSource(root, true);
    writeFileSync(join(root, 'review-note.txt'), 'private review note');
    expect(collectSource(root, true).snapshot).toBe(initial.snapshot);
    writeFileSync(join(root, 'src/index.ts'), 'changed source');
    expect(() => collectSource(root, true)).toThrow('src/index.ts');
  } finally {
    for (const [name, value] of Object.entries(revisions)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('native package cannot pair stale or changed binaries with a new source snapshot', () => {
  const binary = Buffer.from('controlled fixture'), record = {snapshot:'source-a',bun:Bun.version,binarySha256:createHash('sha256').update(binary).digest('hex')};
  expect(() => verifyNativeIdentity(record, 'source-a', binary)).not.toThrow();
  expect(() => verifyNativeIdentity(record, 'source-b', binary)).toThrow('source differs');
  expect(() => verifyNativeIdentity(record, 'source-a', Buffer.from('changed'))).toThrow('build record');
  expect(() => verifyNativeIdentity({...record,bun:'different'}, 'source-a', binary)).not.toThrow();
  expect(nativeBinaryName('bun-windows-x64')).toBe('temper-bun-windows-x64.exe');
  expect(nativeBinaryName('bun-darwin-arm64')).toBe('temper-bun-darwin-arm64');
});
