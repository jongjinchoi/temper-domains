import { expect, test } from 'bun:test';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scopedCheckerFingerprint, checkerSignatures } from './checker-fingerprint.ts';

test('checker fingerprints ignore web dependencies but retain transitive checker dependencies and source', async () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-fingerprint-'));
  const project = resolve(import.meta.dir, '..');
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    for (const path of ['src/checker', 'src/utils', 'bun.lock', 'tsconfig.json']) cpSync(join(project, path), join(root, path), { recursive: true });
    const before = await scopedCheckerFingerprint('rdap', root);
    const lock = Bun.JSONC.parse(readFileSync(join(root, 'bun.lock'), 'utf8')) as any;
    lock.workspaces.web.dependencies.next = '999.0.0';
    lock.packages.next[0] = 'next@999.0.0';
    writeFileSync(join(root, 'bun.lock'), JSON.stringify(lock));
    expect(await scopedCheckerFingerprint('rdap', root)).toBe(before);
    lock.packages['tldts-core'][3] = 'changed-integrity';
    writeFileSync(join(root, 'bun.lock'), JSON.stringify(lock));
    expect(await scopedCheckerFingerprint('rdap', root)).not.toBe(before);
    cpSync(join(project, 'bun.lock'), join(root, 'bun.lock'));
    writeFileSync(join(root, 'src/checker/rdap.ts'), 'export const changed = true;');
    expect(await scopedCheckerFingerprint('rdap', root)).not.toBe(before);
    const catalog = JSON.parse(readFileSync(join(project, 'src/extensions/data/catalog.json'), 'utf8'));
    expect(await checkerSignatures()).toEqual(catalog.checkerSignatures);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
