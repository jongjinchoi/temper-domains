import { expect, test } from 'bun:test';
import { parseArguments, requireVersion, requireDigest } from './real-contract.mjs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('real installation harness requires explicit versions and rejects drift and integrity mismatch', () => {
  for (const args of [[], ['npm'], ['npm', '1.0.0'], ['npm', '1.0.0', '1.0.0'], ['npm', '2.0.0', '1.0.0'], ['npm', 'v1.0.0', '2.0.0'], ['homebrew', '1.0.0', '2.0.0']]) {
    expect(() => parseArguments(args)).toThrow();
  }
  expect(parseArguments(['npm', '1.0.0', '2.0.0']).targetVersion).toBe('2.0.0');
  for (const context of ['published version', 'archive version', 'installed version']) {
    expect(() => requireVersion('2.0.1', '2.0.0', context)).toThrow();
    expect(() => requireVersion('2.0.0', '2.0.0', context)).not.toThrow();
  }
  expect(() => requireDigest(Buffer.from('changed archive'), '0'.repeat(64))).toThrow();
});

test('PTY confirmation rejects changed versions and does not count cancellation as success', () => {
  const result = Bun.spawnSync(['python3', 'tests/update/real-pty-contract.py'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
});

test.skipIf(process.platform === 'win32')('real PTY gate accepts only the expected pair and cancels a changed target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'temper-pty-contract-'));
  try {
    const python = Bun.which('python3')!;
    for (const mode of ['success', 'mismatch', 'changed', 'cancel', 'wrong-result']) {
      await writeFile(join(root, 'session.json'), JSON.stringify({ command: [python, resolve('tests/update/real-pty-fixture.py'), mode], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, startVersion: '1.0.0', targetVersion: '2.0.0' }));
      const child = Bun.spawn([python, 'tests/update/real-cli-pty.py', root], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
      const error = await new Response(child.stderr).text();
      expect(await child.exited === 0, `${mode}: ${error}`).toBe(mode === 'success');
      const result = JSON.parse(await readFile(join(root, 'pty-result.json'), 'utf8'));
      expect(result.confirmed).toBe(mode !== 'mismatch');
      expect(result.rejectedTarget).toBe(['mismatch', 'changed'].includes(mode));
      expect(result.success).toBe(mode === 'success');
      expect((await readFile(join(root, 'session.raw'))).length).toBeGreaterThan(0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
