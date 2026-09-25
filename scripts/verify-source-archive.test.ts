import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifySourceArchive } from './verify-source-archive.ts';

test('source archive verification reads actual contents and rejects corruption and symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-archive-test-'));
  try {
    const stage = join(root, 'stage'); mkdirSync(stage);
    const manifest = { revision: 'a'.repeat(40), snapshot: 'snapshot', dirty: false,
      files: { 'input.ts': createHash('sha256').update('original').digest('hex') } };
    writeFileSync(join(stage, 'input.ts'), 'original');
    writeFileSync(join(stage, 'SOURCE-MANIFEST.json'), JSON.stringify(manifest));
    const local = join(root, 'manifest.json'), archive = join(root, 'source.tar.gz');
    writeFileSync(local, JSON.stringify(manifest));
    const pack = () => execFileSync('tar', ['-czf', archive, '-C', stage, '.']);
    pack(); expect(() => verifySourceArchive(local, archive)).not.toThrow();
    writeFileSync(join(stage, 'input.ts'), 'corrupted');
    pack(); expect(() => verifySourceArchive(local, archive)).toThrow('file differs');
    rmSync(join(stage, 'input.ts')); symlinkSync(local, join(stage, 'input.ts'));
    pack(); expect(() => verifySourceArchive(local, archive)).toThrow('non-regular');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
