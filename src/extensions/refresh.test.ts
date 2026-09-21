import { hash, ROOT_SOURCE, PSL_SOURCE, RDAP_SOURCE } from "./inventory.ts";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshCatalog, type CatalogEvidence } from "../../scripts/update-extension-catalog.ts";

const root = "COM\nUK\n";
const psl = "// ===BEGIN ICANN DOMAINS===\ncom\nuk\nco.uk\n// ===END ICANN DOMAINS===";
const rdap = JSON.stringify({ services: [[["com", "uk"], ["https://rdap.example/"]]] });
const evidence: CatalogEvidence = {
  reviews: { sources: {}, classifications: {}, lookups: {} },
  captures: [root,psl,rdap].map((text,index)=>({ url: [ROOT_SOURCE,PSL_SOURCE,RDAP_SOURCE][index]!, sha256: hash(text), capturedAt: '2026-09-20T00:00:00Z' })),
  commercial: [
    { provider: "A", source: "https://a.example/prices", checkedAt: "2026-09-20", suffixes: ["com", "co.uk"] },
    { provider: "B", source: "https://b.example/prices", checkedAt: "2026-09-20", suffixes: ["com"] },
  ],
  editorial: { overrides: {}, regions: [] },
};
const noFetch = async () => { throw new Error("must not fetch saved input"); };

test("catalog refresh publishes offering and boundary evidence as one snapshot and preserves it on failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-catalog-"));
  const file = join(dir, "catalog.json");
  try {
    const initial = await refreshCatalog(file, noFetch, new Date("2026-09-20"), root, psl, rdap, evidence);
    expect(initial.commercialSources).toEqual(evidence.commercial);
    expect(initial.entries.find(e => e.suffix === "co.uk")?.offers?.[0]?.provider).toBe("A");
    const original = await readFile(file, "utf8");
    const previewEvidence = structuredClone(evidence);
    previewEvidence.commercial[0]!.suffixes.push("uk");
    const preview = await refreshCatalog(file, noFetch, new Date("2026-09-22"), root, psl, rdap, previewEvidence, false);
    expect(preview.checkedAt).toBe("2026-09-20T00:00:00Z");
    expect(preview.generatedAt).toBe("2026-09-22T00:00:00.000Z");
    expect(preview.entries.find(e => e.suffix === "uk")?.offers).toHaveLength(1);
    expect(await readFile(file, "utf8")).toBe(original);
    const shrink = structuredClone(evidence);
    shrink.commercial[0]!.suffixes = ["com"];
    await expect(refreshCatalog(file, noFetch, new Date("2026-09-22"), root, psl, rdap, shrink)).rejects.toThrow(/shrink|Incomplete/);
    expect(await readFile(file, "utf8")).toBe(original);
    for (const bad of [
      { ...evidence, reviews: undefined },
      { ...evidence, captures: evidence.captures!.map(c => ({ ...c, sha256: '0'.repeat(64) })) },
      { ...evidence, commercial: [] },
      { ...evidence, commercial: [evidence.commercial[0]!] },
      { ...evidence, commercial: [{ ...evidence.commercial[0]!, suffixes: ["com", "com"] }, evidence.commercial[1]!] },
      { ...evidence, editorial: { overrides: { com: { assignments: [{ facet: "industry", id: "made-up", reason: "invalid", source: "https://a.example", evidenceType: "editorial", checkedAt: "2026-09-20" }] } }, regions: [] } },
    ]) {
      await expect(refreshCatalog(file, noFetch, new Date("2026-09-22"), root, psl, rdap, bad as CatalogEvidence)).rejects.toThrow();
      expect(await readFile(file, "utf8")).toBe(original);
    }
    await expect(refreshCatalog(file, async () => { throw new Error("download failed"); }, new Date("2026-09-22"), undefined, undefined, undefined, evidence)).rejects.toThrow("download failed");
    expect(await readFile(file, "utf8")).toBe(original);
    await expect(refreshCatalog(file, async () => "invalid", new Date("2026-09-22"), undefined, undefined, undefined, evidence)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(original);
    await expect(refreshCatalog(file, noFetch, new Date("2026-09-20T01:00:00Z"), undefined, undefined, undefined, evidence)).rejects.toThrow("24 hours");
    expect(await readFile(file, "utf8")).toBe(original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

import { catalogChanges } from '../../scripts/update-extension-catalog.ts';
import { buildInventory } from './inventory.ts';
import { buildCatalogSnapshot } from './snapshot.ts';
test('refresh exposes actual endpoint changes even when both routes use RDAP', () => {
  const before = buildCatalogSnapshot(buildInventory(root, psl, '2026-09-20', rdap), evidence.commercial, evidence.editorial);
  const after = buildCatalogSnapshot(buildInventory(root, psl, '2026-09-22', rdap.replace('rdap.example', 'new.example')), evidence.commercial, evidence.editorial);
  expect(catalogChanges(before, after).routeChanges).toEqual(['co.uk', 'com']);
});

test('download freshness follows the PSL capture, while saved inputs preserve their own dates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'temper-catalog-dates-'));
  const file = join(dir, 'catalog.json');
  const mixed = structuredClone(evidence);
  mixed.captures![1]!.capturedAt = '2026-09-22T00:00:00Z';
  try {
    await refreshCatalog(file, noFetch, new Date('2026-09-22'), root, psl, rdap, mixed);
    await expect(refreshCatalog(file, noFetch, new Date('2026-09-22T01:00:00Z'), undefined, undefined, undefined, { ...evidence, captures: undefined })).rejects.toThrow('24 hours');
    const fetchText = async (url: string) => url === ROOT_SOURCE ? root : url === PSL_SOURCE ? psl : rdap;
    const downloaded = await refreshCatalog(file, fetchText, new Date('2026-09-24'), undefined, undefined, undefined, { ...evidence, captures: undefined });
    expect(downloaded.sources.every(s => s.capturedAt === '2026-09-24T00:00:00.000Z')).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
