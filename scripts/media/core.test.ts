import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { outputPaths, promote, snapshot } from './core.ts';

describe('documentation capture safeguards', () => {
  test('rejects paths outside the screenshot directory and duplicate outputs', () => {
    expect(() => outputPaths(['Output assets/demo.gif'])).toThrow();
    expect(() => outputPaths(['Output assets/screenshots/../demo.gif'])).toThrow();
    expect(() => outputPaths(['Output assets/screenshots/demo.gif\nOutput assets/screenshots/demo.gif'])).toThrow();
  });

  test('preserves files changed since capture and restores a partial copy failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'temper-media-test-'));
    const stage = join(dir, 'stage'), target = join(dir, 'target');
    await mkdir(stage); await mkdir(target);
    const paths = ['one', 'two'];
    try {
      for (const name of paths) {
        await writeFile(join(stage, name), `new-${name}`);
        await writeFile(join(target, name), `old-${name}`);
      }
      const baseline = snapshot(target, paths);
      await writeFile(join(target, 'two'), 'user-change');
      await expect(promote(stage, target, paths, baseline)).rejects.toThrow('changed');
      expect(await readFile(join(target, 'one'), 'utf8')).toBe('old-one');
      expect(await readFile(join(target, 'two'), 'utf8')).toBe('user-change');
      await writeFile(join(target, 'two'), 'old-two');
      let copies = 0;
      await expect(promote(stage, target, paths, baseline, async (from, to) => {
        if (++copies === 2) throw new Error('simulated write failure');
        await copyFile(from, to);
      })).rejects.toThrow('simulated write failure');
      expect(snapshot(target, paths)).toEqual(baseline);
      await promote(stage, target, paths, baseline);
      expect(await readFile(join(target, 'two'), 'utf8')).toBe('new-two');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
