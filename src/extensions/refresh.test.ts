import { hash, ROOT_SOURCE, PSL_SOURCE, RDAP_SOURCE } from "./inventory.ts";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { refreshCatalog, regenerateRuntimeCatalog, type CatalogEvidence } from "../../scripts/update-extension-catalog.ts";
import { verifyBundledCheckerSignatures } from '../../scripts/checker-fingerprint.ts';

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
    const runtimeFile = join(dir, "runtime-catalog.json");
    expect(await Bun.file(runtimeFile).exists()).toBe(true);
    const runtimeOriginal = await readFile(runtimeFile, "utf8");
    const runtime = JSON.parse(runtimeOriginal);
    expect(runtime.inventory.entries.map((entry: { suffix: string }) => entry.suffix)).toEqual(["co.uk", "com"]);
    expect(runtime.inventory.lookupPlans).toEqual(initial.lookupPlans);
    const original = await readFile(file, "utf8");
    const previewEvidence = structuredClone(evidence);
    previewEvidence.commercial[0]!.suffixes.push("uk");
    const preview = await refreshCatalog(file, noFetch, new Date("2026-09-22"), root, psl, rdap, previewEvidence, false);
    expect(preview.checkedAt).toBe("2026-09-20T00:00:00Z");
    expect(preview.generatedAt).toBe("2026-09-22T00:00:00.000Z");
    expect(preview.entries.find(e => e.suffix === "uk")?.offers).toHaveLength(1);
    expect(await readFile(file, "utf8")).toBe(original);
    expect(await readFile(runtimeFile, "utf8")).toBe(runtimeOriginal);
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
      expect(await readFile(runtimeFile, "utf8")).toBe(runtimeOriginal);
    }
    await expect(refreshCatalog(file, async () => { throw new Error("download failed"); }, new Date("2026-09-22"), undefined, undefined, undefined, evidence)).rejects.toThrow("download failed");
    expect(await readFile(file, "utf8")).toBe(original);
    await expect(refreshCatalog(file, async () => "invalid", new Date("2026-09-22"), undefined, undefined, undefined, evidence)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(original);
    await expect(refreshCatalog(file, noFetch, new Date("2026-09-20T01:00:00Z"), undefined, undefined, undefined, evidence)).rejects.toThrow("24 hours");
    expect(await readFile(file, "utf8")).toBe(original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('publication failures preserve complete runtime data and recover without retimestamping the full catalog', async () => {
  for (const mode of ['write-full', 'write-runtime', 'rename-full', 'rename-runtime', 'interrupt']) {
    const dir = await mkdtemp(join(tmpdir(), 'temper-catalog-publish-'));
    const file = join(dir, 'catalog.json');
    const runtimeFile = join(dir, 'runtime-catalog.json');
    let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
    try {
      await refreshCatalog(file, noFetch, new Date('2026-09-20'), root, psl, rdap, evidence);
      const originalFull = await readFile(file, 'utf8');
      const originalRuntime = await readFile(runtimeFile, 'utf8');
      const nextEvidence = structuredClone(evidence);
      nextEvidence.commercial[0]!.suffixes.push('uk');
      await writeFile(join(dir, 'request.json'), JSON.stringify({ root, psl, rdap, evidence: nextEvidence }));
      child = Bun.spawn(['bun', resolve('tests/helpers/catalog-publication-worker.ts'), file, mode], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, HOME: dir } });
      if (mode === 'interrupt') {
        const reader = child.stdout.getReader();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const ready = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Publication did not reach runtime rename')), 10000); })]);
          expect(new TextDecoder().decode(ready.value)).toBe('READY\n');
          child.kill('SIGKILL');
        } finally { clearTimeout(timer); reader.releaseLock(); }
        await child.exited;
      } else {
        const [status, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect(status, error).toBe(0);
        expect(JSON.parse(output).error).toContain('--runtime-only');
        expect((await readdir(dir)).filter(name => name.endsWith('.tmp'))).toEqual([]);
      }
      expect(await readFile(runtimeFile, 'utf8')).toBe(originalRuntime);
      const afterFull = await readFile(file, 'utf8');
      if (mode === 'rename-runtime' || mode === 'interrupt') {
        expect(JSON.parse(afterFull).generatedAt).toBe('2026-09-22T00:00:00.000Z');
        await expect(verifyBundledCheckerSignatures(file)).rejects.toThrow(/Runtime catalog differs/);
      } else {
        expect(afterFull).toBe(originalFull);
        await verifyBundledCheckerSignatures(file);
      }
      await regenerateRuntimeCatalog(file, true);
      expect(await readFile(file, 'utf8')).toBe(afterFull);
      await verifyBundledCheckerSignatures(file);
      if (mode === 'rename-runtime' || mode === 'interrupt') expect(JSON.parse(await readFile(runtimeFile, 'utf8')).inventory.entries.some((entry: { suffix: string }) => entry.suffix === 'uk')).toBe(true);
    } finally { child?.kill(); if (child) await child.exited; await rm(dir, { recursive: true, force: true }); }
  }
}, 20000);

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
