import { test, expect } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('package smoke rejects an installed npm package whose bin is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-missing-bin-'));
  try {
    mkdirSync(join(root, 'package'));
    writeFileSync(join(root, 'package/package.json'), JSON.stringify({
      name: 'temper-domains', version: '0.0.0', bin: { temper: 'missing.js' },
    }));
    const archive = join(root, 'broken.tgz');
    execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
    const result = spawnSync(process.execPath, [resolve('tests/packaging/smoke.mjs'), 'npm', archive], {
      encoding: 'utf8', timeout: 30000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Packaged CLI failed');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 35000);

test('package smoke rejects a native archive with no executable', () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-missing-native-'));
  try {
    writeFileSync(join(root, 'SOURCE.md'), 'controlled incomplete archive');
    const archive = join(root, 'broken.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', root, 'SOURCE.md']);
    const platform = process.platform === 'win32' ? 'windows' : process.platform;
    const result = spawnSync(process.execPath, [resolve('tests/packaging/smoke.mjs'), 'native', `bun-${platform}-${process.arch}`, archive], {
      encoding: 'utf8', timeout: 10000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Packaged CLI failed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
