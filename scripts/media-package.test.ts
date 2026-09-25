import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { checkManifest, digest, inputHashes, MANIFEST, ROOT } from './media/core.ts';
import { manifestForCurrentPackage, recordPackageSource, type DocumentationManifest } from './media-package.ts';

const capture = JSON.parse(readFileSync(`${ROOT}/${MANIFEST}`, 'utf8')) as DocumentationManifest;
const source = capture.packageSource!;
// A unit-test fixture for package comparison, not a refreshed capture record.
// docs:check separately checks the original manifest against the live source.
const fixture = { ...capture, inputs: { ...inputHashes(), 'package.json': digest(source) } };

test('public capture metadata omits machine paths without changing capture evidence', () => {
  for (const bunExecutable of ['/home/recorder/.bun/bin/bun', 'C:\\Users\\recorder\\bun.exe']) {
    const original = { ...fixture, runtime: { ...fixture.runtime, bunExecutable, entry: '/home/recorder/temper/src/index.ts' } };
    const before = JSON.stringify(original);
    const recorded = recordPackageSource(original, source);
    expect(recorded.runtime.bunExecutable).toBe(bunExecutable.endsWith('.exe') ? 'bun.exe' : 'bun');
    expect(recorded.runtime.entry).toBe('src/index.ts');
    expect({ ...recorded, runtime: original.runtime }).toEqual({ ...original, packageSource: source });
    expect(JSON.stringify(original)).toBe(before);
  }
});

test('version-only changes pass without changing the original capture record', () => {
  const manifest = recordPackageSource(fixture, source);
  const before = JSON.stringify(manifest);
  const current = JSON.stringify({ ...JSON.parse(source), version: '9.8.7' });
  const comparison = manifestForCurrentPackage(manifest, current);
  expect(comparison.inputs['package.json']).toBe(digest(current));
  expect(JSON.stringify(manifest)).toBe(before);
  checkManifest(manifestForCurrentPackage(manifest, readFileSync(`${ROOT}/package.json`, 'utf8')));
});

test('dependency, script, name and engine changes still fail', () => {
  const manifest = recordPackageSource(capture, source);
  for (const [field, value] of Object.entries({ dependencies: { ink: '0.0.0' }, scripts: {}, name: 'different', engines: { node: '>=99' } })) {
    expect(() => manifestForCurrentPackage(manifest, JSON.stringify({ ...JSON.parse(source), [field]: value }))).toThrow();
  }
});

test('approved license and documentation additions preserve capture identity', () => {
  const before = JSON.stringify(fixture);
  const pkg = JSON.parse(source);
  const current = JSON.stringify({ ...pkg, license: 'AGPL-3.0-only', files: [...pkg.files, 'docs/cli.md', 'docs/mcp.md', 'SOURCE.md', 'THIRD_PARTY_NOTICES.md'] });
  expect(() => manifestForCurrentPackage(fixture, current)).not.toThrow();
  expect(JSON.stringify(fixture)).toBe(before);
  for (const files of [pkg.files.filter((p: string) => p !== 'dist/npm'), [...pkg.files, 'scripts/publish.ts'], ['**/*']]) {
    expect(() => manifestForCurrentPackage(fixture, JSON.stringify({ ...pkg, files }))).toThrow();
  }
  expect(() => manifestForCurrentPackage(fixture, JSON.stringify({ ...pkg, license: 'Unlicense' }))).toThrow();
});

test('missing or altered capture package evidence fails closed', () => {
  expect(() => manifestForCurrentPackage({ ...capture, packageSource: undefined }, source)).toThrow();
  expect(() => recordPackageSource(capture, source + '\n')).toThrow('original capture hash');
  expect(() => manifestForCurrentPackage({ ...capture, packageSource: source + '\n' }, source)).toThrow();
});

test('screen source and media changes remain errors', () => {
  const manifest = recordPackageSource(fixture, source);
  const comparison = manifestForCurrentPackage(manifest, readFileSync(`${ROOT}/package.json`, 'utf8'));
  expect(() => checkManifest({ ...comparison, inputs: { ...comparison.inputs, 'src/tui/SearchView.tsx': 'changed' } })).toThrow();
  const path = Object.keys(comparison.outputs)[0]!;
  expect(() => checkManifest({ ...comparison, outputs: { ...comparison.outputs, [path]: { ...comparison.outputs[path]!, sha256: 'changed' } } })).toThrow();
});
