import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshCatalog, type CatalogEvidence } from "../../scripts/update-extension-catalog.ts";

const root = "COM\nUK\n";
const psl = "// ===BEGIN ICANN DOMAINS===\ncom\nuk\nco.uk\n// ===END ICANN DOMAINS===";
const rdap = JSON.stringify({ services: [[["com", "uk"], ["https://rdap.example/"]]] });
const evidence: CatalogEvidence = {
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
    expect(preview.entries.find(e => e.suffix === "uk")?.offers).toHaveLength(1);
    expect(await readFile(file, "utf8")).toBe(original);
    const shrink = structuredClone(evidence);
    shrink.commercial[0]!.suffixes = ["com"];
    await expect(refreshCatalog(file, noFetch, new Date("2026-09-22"), root, psl, rdap, shrink)).rejects.toThrow(/shrink|Incomplete/);
    expect(await readFile(file, "utf8")).toBe(original);
    for (const bad of [
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
