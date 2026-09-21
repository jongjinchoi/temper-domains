import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { buildInventory, ROOT_SOURCE, PSL_SOURCE, RDAP_SOURCE } from "../src/extensions/inventory.ts";
import { buildCatalogSnapshot, supportedSuffixes } from "../src/extensions/snapshot.ts";
import { lookupRoute } from "../src/extensions/boundary.ts";
import type { CommercialSource, EditorialData, Inventory } from "../src/extensions/types.ts";

export interface CatalogEvidence { commercial: CommercialSource[]; editorial: EditorialData }

export function catalogChanges(old: Inventory | undefined, next: Inventory) {
  const before = new Set(old ? supportedSuffixes(old) : []);
  const after = new Set(supportedSuffixes(next));
  return {
    version: next.version, checkedAt: next.checkedAt, total: after.size,
    added: [...after].filter(s => !before.has(s)), removed: [...before].filter(s => !after.has(s)),
    routeChanges: old ? [...after].filter(s => before.has(s) && lookupRoute(s, old) !== lookupRoute(s, next)) : [],
    unclassified: next.entries.filter(e => after.has(e.suffix) && !e.assignments.some(a => a.facet !== "region")).map(e => e.suffix),
    sources: next.sources, commercialSources: next.commercialSources?.map(({ suffixes, ...source }) => ({ ...source, count: suffixes.length })),
  };
}

export async function refreshCatalog(file: string, fetchText: (url: string) => Promise<string>, now = new Date(), rootText?: string, pslText?: string, rdapText?: string, evidence?: CatalogEvidence, apply = true): Promise<Inventory> {
  const old = await readFile(file, "utf8").then(text => JSON.parse(text) as Inventory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!evidence) throw new Error("Commercial and classification evidence is required; no snapshot was changed");
  const saved = [rootText, pslText, rdapText].filter(value => value !== undefined).length;
  if (saved !== 0 && saved !== 3) throw new Error("Provide all three saved IANA, PSL and RDAP inputs");
  if (!saved && old && now.getTime() - Date.parse(old.checkedAt) < 86400000) throw new Error("Catalog was refreshed less than 24 hours ago; reuse the bundled snapshot.");
  const texts = saved ? [rootText!, pslText!, rdapText!] : await Promise.all([fetchText(ROOT_SOURCE), fetchText(PSL_SOURCE), fetchText(RDAP_SOURCE)]);
  const raw = buildInventory(texts[0]!, texts[1]!, now.toISOString(), texts[2]);
  const data = buildCatalogSnapshot(raw, evidence.commercial, evidence.editorial);
  // Reject incomplete captures before replacing any runtime evidence.
  if (old) {
    if (data.roots.length < old.roots.length * 0.9 || data.rules.length < old.rules.length * 0.9 || supportedSuffixes(data).length < supportedSuffixes(old).length * 0.9) throw new Error("Unexpected catalog shrink; review upstream data before replacing the snapshot");
    for (const previous of old.commercialSources ?? []) {
      const current = data.commercialSources!.find(s => s.provider === previous.provider);
      if (!current || current.suffixes.length < previous.suffixes.length * 0.9) throw new Error(`Incomplete commercial source: ${previous.provider}`);
    }
  }
  if (!apply) return data;
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data) + "\n", { flag: "wx" });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
  return data;
}

if (import.meta.main) {
  const [input, mode, ...extra] = process.argv.slice(2);
  if (!input || (mode !== undefined && mode !== "--apply") || extra.length) throw new Error("Usage: bun run catalog:update <input-directory> [--apply]. Preview is the default; all six saved evidence files are required.");
  const sourceDir = resolve(input);
  const [root, psl, rdap, commercial, overrides, regions] = await Promise.all(["roots.txt", "public_suffix_list.dat", "rdap.json", "commercial.json", "overrides.json", "regions.json"].map(name => readFile(join(sourceDir, name), "utf8")));
  const file = resolve(import.meta.dir, "../src/extensions/data/catalog.json");
  const old = JSON.parse(await readFile(file, "utf8")) as Inventory;
  const data = await refreshCatalog(file, async () => { throw new Error("Saved-input refresh must not download data"); }, new Date(), root, psl, rdap, { commercial: JSON.parse(commercial!), editorial: { overrides: JSON.parse(overrides!), regions: JSON.parse(regions!) } }, mode === "--apply");
  console.log(JSON.stringify({ applied: mode === "--apply", ...catalogChanges(old, data) }, null, 2));
}
