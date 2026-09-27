import { expect, test } from 'bun:test';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scopedCheckerFingerprint, checkerSignatures, verifyBundledCheckerSignatures } from './checker-fingerprint.ts';
import { regenerateRuntimeCatalog } from './update-extension-catalog.ts';

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
    const transaction = join(root, 'src/utils/file-transaction.ts');
    writeFileSync(transaction, readFileSync(transaction, 'utf8') + '\n// changed transaction\n');
    expect(await scopedCheckerFingerprint('rdap', root)).not.toBe(before);
    cpSync(join(project, 'src/utils/file-transaction.ts'), transaction);
    const diagnostics = join(root, 'src/utils/storage-error.ts');
    writeFileSync(diagnostics, readFileSync(diagnostics, 'utf8') + '\n// changed storage diagnostics\n');
    expect(await scopedCheckerFingerprint('rdap', root)).not.toBe(before);
    cpSync(join(project, 'src/utils/storage-error.ts'), diagnostics);
    writeFileSync(join(root, 'src/checker/rdap.ts'), 'export const changed = true;');
    expect(await scopedCheckerFingerprint('rdap', root)).not.toBe(before);
    const catalog = JSON.parse(readFileSync(join(project, 'src/extensions/data/catalog.json'), 'utf8'));
    expect(await checkerSignatures()).toEqual(catalog.checkerSignatures);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('build verification rejects a missing or mismatched runtime without changing the full source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'temper-runtime-guard-'));
  const file = join(dir, 'catalog.json');
  const original = readFileSync(resolve(import.meta.dir, '../src/extensions/data/catalog.json'), 'utf8');
  try {
    writeFileSync(file, original);
    await expect(verifyBundledCheckerSignatures(file)).rejects.toThrow(/runtime.*catalog|Runtime catalog/);
    writeFileSync(join(dir, 'runtime-catalog.json'), '{}');
    await expect(verifyBundledCheckerSignatures(file)).rejects.toThrow(/runtime.*catalog|Runtime catalog/);
    const preview = await regenerateRuntimeCatalog(file);
    expect(readFileSync(join(dir, 'runtime-catalog.json'), 'utf8')).toBe('{}');
    await regenerateRuntimeCatalog(file, true);
    await verifyBundledCheckerSignatures(file);
    expect(readFileSync(file, 'utf8')).toBe(original);
    const runtimeFile = join(dir, 'runtime-catalog.json');
    const valid = readFileSync(runtimeFile, 'utf8');
    expect(JSON.parse(valid)).toEqual(preview);
    for (const change of [
      (data: any) => { data.catalogVersion = 'stale'; },
      (data: any) => { data.inventory.entries[0].checkedAt = 'changed'; },
      (data: any) => { data.inventory.lookupPlans.com.endpoints = ['https://wrong.example/']; },
    ]) {
      const invalid = JSON.parse(valid); change(invalid);
      writeFileSync(runtimeFile, JSON.stringify(invalid));
      await expect(verifyBundledCheckerSignatures(file)).rejects.toThrow(/Runtime catalog differs/);
    }
    writeFileSync(runtimeFile, '{');
    await expect(verifyBundledCheckerSignatures(file)).rejects.toThrow(/Cannot read runtime catalog/);
    await regenerateRuntimeCatalog(file, true);
    expect(readFileSync(runtimeFile, 'utf8')).toBe(valid);
    expect(readFileSync(file, 'utf8')).toBe(original);
    const changedFull = JSON.parse(original);
    changedFull.generatedAt = '2026-09-28T01:00:00Z';
    writeFileSync(file, JSON.stringify(changedFull));
    await expect(verifyBundledCheckerSignatures(file)).rejects.toThrow(/Runtime catalog differs/);
    changedFull.checkerSignatures.rdap = 'invalid';
    writeFileSync(file, JSON.stringify(changedFull));
    await expect(regenerateRuntimeCatalog(file, true)).rejects.toThrow(/Checker sources changed/);
    expect(readFileSync(runtimeFile, 'utf8')).toBe(valid);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
