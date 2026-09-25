import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { captureInputChanges, checkManifest, MANIFEST, ROOT } from './media/core.ts';
import { recordPackageSource, type DocumentationManifest } from './media-package.ts';

const capture = JSON.parse(readFileSync(`${ROOT}/${MANIFEST}`, 'utf8')) as DocumentationManifest;
const source = capture.packageSource!;

test('public capture metadata omits machine paths without changing capture evidence', () => {
  for (const bunExecutable of ['/home/recorder/.bun/bin/bun', 'C:\\Users\\recorder\\bun.exe']) {
    const original = { ...capture, runtime: { ...capture.runtime, bunExecutable, entry: '/home/recorder/temper/src/index.ts' } };
    const before = JSON.stringify(original);
    const recorded = recordPackageSource(original, source);
    expect(recorded.runtime.bunExecutable).toBe(bunExecutable.endsWith('.exe') ? 'bun.exe' : 'bun');
    expect(recorded.runtime.entry).toBe('src/index.ts');
    expect({ ...recorded, runtime: original.runtime }).toEqual({ ...original, packageSource: source });
    expect(JSON.stringify(original)).toBe(before);
  }
});

test('input drift is review information; original media integrity remains enforced', () => {
  const before = JSON.stringify(capture);
  const changed = { ...capture, inputs: { ...capture.inputs, 'src/tui/SearchView.tsx': 'changed' } };
  expect(captureInputChanges(changed)).toContain('src/tui/SearchView.tsx');
  expect(() => checkManifest(changed, ROOT, ROOT, false)).not.toThrow();
  // A new recording must still match the inputs it claims to have captured.
  expect(() => checkManifest(changed)).toThrow('Capture inputs changed');
  const path = Object.keys(capture.outputs)[0]!;
  const corrupt = { ...capture, outputs: { ...capture.outputs, [path]: { ...capture.outputs[path]!, sha256: 'changed' } } };
  expect(() => checkManifest(corrupt, ROOT, ROOT, false)).toThrow('Media differs');
  expect(JSON.stringify(capture)).toBe(before);
});

test('altered original package evidence remains an error', () => {
  expect(() => recordPackageSource(capture, source + '\n')).toThrow('original capture hash');
});
