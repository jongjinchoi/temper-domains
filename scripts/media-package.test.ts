import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { checkManifest, digest, inputHashes, MANIFEST, ROOT } from './media/core.ts';
import { manifestForCurrentPackage, recordPackageSource, type DocumentationManifest } from './media-package.ts';

const capture = JSON.parse(readFileSync(`${ROOT}/${MANIFEST}`, 'utf8')) as DocumentationManifest;
const source = capture.packageSource!;
// A unit-test fixture for package comparison, not a refreshed capture record.
// docs:check separately checks the original manifest against the live source.
const fixture = { ...capture, inputs: { ...inputHashes(), 'package.json': digest(source) } };

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
