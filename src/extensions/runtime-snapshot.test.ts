import { expect, test } from 'bun:test';
import fullSnapshot from './data/catalog.json';
import * as catalog from './catalog.ts';
import { normalizeSuffix, catalogLookupPlan, lookupRoute } from './boundary.ts';
import { verificationSummary } from './evidence.ts';
import { hash } from './inventory.ts';
import { INDUSTRIES, PURPOSES } from './taxonomy.ts';
import { DEFAULT_TLDS, EXTENDED_TLDS } from '../checker/types.ts';
import type { Inventory } from './types.ts';
import { projectRuntimeCatalog } from './runtime-snapshot.ts';

const full = fullSnapshot as Inventory;
// Keep the pre-projection consumer contract independent of the new projector.
const expectedEntries = full.entries.filter(entry => {
  if (!entry.offers?.length || lookupRoute(entry.suffix, full) === 'unsupported') return false;
  try { return normalizeSuffix(entry.suffix, full) === entry.suffix; } catch { return false; }
}).sort((a, b) => a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0);
const expectedVersion = hash(JSON.stringify(full) + JSON.stringify([INDUSTRIES, PURPOSES]) + JSON.stringify(full.entries.map(entry => lookupRoute(entry.suffix, full)))).slice(0, 16);

test('runtime drops maintenance-only entries while keeping every namespace denial and global routing input', () => {
  const retained = new Set(expectedEntries.map(entry => entry.suffix));
  expect(catalog.inventory.entries.length).toBeLessThan(full.entries.length);
  expect(catalog.inventory).toEqual({ ...full, entries: full.entries.filter(entry => retained.has(entry.suffix) || entry.namespace) });
});

test('projection preserves future namespace denials and new offerings without changing its input', () => {
  const input = structuredClone(full);
  input.entries.find(entry => entry.suffix === 'google')!.namespace = { reason: 'Test registry exclusion', source: 'https://registry.example/' };
  input.entries.find(entry => entry.suffix === 'ac.me')!.offers = [{ provider: 'Test', source: 'https://registry.example/', checkedAt: full.checkedAt }];
  const before = JSON.stringify(input);
  const runtime = projectRuntimeCatalog(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(runtime.inventory.entries.some(entry => entry.suffix === 'ac.me')).toBe(true);
  expect(() => normalizeSuffix('google', runtime.inventory)).toThrow('Test registry exclusion');
  const originalVersion = runtime.catalogVersion;
  input.entries.find(entry => entry.suffix === 'gov')!.checkedAt = '2026-09-28';
  expect(projectRuntimeCatalog(input).catalogVersion).not.toBe(originalVersion);
});

test('full catalog boundaries and entire routes survive projection, including wildcard and private inputs', () => {
  const suffixes = new Set([...full.entries.map(entry => entry.suffix),
    ...full.rules.filter(rule => rule.startsWith('*.')).map(rule => `c3-probe.${rule.slice(2)}`),
    ...full.rules.filter(rule => rule.startsWith('!')).map(rule => rule.slice(1)),
    ' .CO.UK ', 'рф', 'blogspot.com', 'mybrand.com', 'www.ck', 'b.ck', 'ac.me', 'arpa', '', 'com.', 'https://co.uk', 'no-such-extension']);
  const normalize = (suffix: string, inventory: Inventory) => {
    try { return { value: normalizeSuffix(suffix, inventory) }; }
    catch (error) { return { error: (error as Error).message }; }
  };
  for (const suffix of suffixes) {
    expect(normalize(suffix, catalog.inventory)).toEqual(normalize(suffix, full));
    expect(catalogLookupPlan(suffix, catalog.inventory)).toEqual(catalogLookupPlan(suffix, full));
  }
});

test('public pages keep full evidence and accept the original full-catalog cursors', () => {
  expect(catalog.catalogVersion).toBe(expectedVersion);
  const key = hash(JSON.stringify({ catalogVersion: expectedVersion, query: null, industries: null, purposes: null, regions: null }));
  for (let offset = 0; offset < expectedEntries.length; offset += 100) {
    const cursor = offset ? Buffer.from(JSON.stringify({ key, offset })).toString('base64url') : undefined;
    const page = catalog.browseExtensions({ limit: 100, cursor });
    expect(page.checkedAt).toBe(full.checkedAt);
    expect(page.generatedAt).toBe(full.generatedAt);
    expect(page.matched).toBe(expectedEntries.length);
    expect(page.items).toEqual(expectedEntries.slice(offset, offset + 100).map(entry => ({
      ...entry, lookupSupport: lookupRoute(entry.suffix, full),
      classificationEvidence: entry.classificationReview?.sources.map(id => full.reviewSources?.[id]).filter(Boolean) ?? [],
      verification: verificationSummary(entry, full, full.checkerSignatures?.[lookupRoute(entry.suffix, full) === 'whois' ? 'whois' : 'rdap'] ?? ''),
    })));
    expect(page.nextCursor).toBe(offset + 100 < expectedEntries.length ? Buffer.from(JSON.stringify({ key, offset: offset + 100 })).toString('base64url') : null);
  }
  for (const suffix of [...DEFAULT_TLDS, ...EXTENDED_TLDS]) expect(expectedEntries.some(entry => entry.suffix === suffix)).toBe(true);
});
