import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceIdentity } from './source-revision.mjs';

test('source identity rejects uncommitted public inputs and mismatched deployment revisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-source-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    expect(() => sourceIdentity(root, { publicBuild: true })).toThrow('Git checkout');
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(root, 'input'), 'source'); git('add', 'input'); git('commit', '-m', 'fixture');
    const clean = sourceIdentity(root, { publicBuild: true, expectedRevision: '' });
    expect(clean.sourceUrl).toEndWith(`/tree/${clean.revision}`);
    expect(() => sourceIdentity(root, { publicBuild: true, expectedRevision: '0'.repeat(40) })).toThrow('differs');
    writeFileSync(join(root, 'input'), 'changed');
    expect(sourceIdentity(root, { publicBuild: false }).sourceUrl).toBeNull();
    expect(() => sourceIdentity(root, { publicBuild: true, expectedRevision: '' })).toThrow('committed');
    git('checkout', '--', 'input'); writeFileSync(join(root, 'new-input'), 'new source');
    expect(() => sourceIdentity(root, { publicBuild: true, expectedRevision: '' })).toThrow('committed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
