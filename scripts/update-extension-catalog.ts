import { checkerSignatures } from "./checker-fingerprint.ts";
import { applyReviewEvidence } from "../src/extensions/evidence.ts";
import { hash } from "../src/extensions/inventory.ts";
import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { buildInventory, ROOT_SOURCE, PSL_SOURCE, RDAP_SOURCE } from "../src/extensions/inventory.ts";
import { buildCatalogSnapshot, supportedSuffixes } from "../src/extensions/snapshot.ts";
import { catalogLookupPlan } from "../src/extensions/boundary.ts";
import type { CommercialSource, EditorialData, Inventory, SourceCapture, ReviewEvidence } from "../src/extensions/types.ts";

export interface CatalogEvidence { commercial: CommercialSource[]; editorial: EditorialData; captures?: SourceCapture[]; reviews?: ReviewEvidence }

export function catalogChanges(old: Inventory | undefined, next: Inventory) {
  const before = new Set(old ? supportedSuffixes(old) : []);
  const after = new Set(supportedSuffixes(next));
  return {
    version: next.version, checkedAt: next.checkedAt, total: after.size,
    added: [...after].filter(s => !before.has(s)), removed: [...before].filter(s => !after.has(s)),
    routeChanges: old ? [...after].filter(s => before.has(s) && !!old.lookupPlans?.[s] && JSON.stringify(catalogLookupPlan(s, old)) !== JSON.stringify(catalogLookupPlan(s, next))) : [],
    routeMetadataAdded: old ? [...after].filter(s => before.has(s) && !old.lookupPlans?.[s]) : [],
    reviewChanges: old ? [...after].filter(s => JSON.stringify(old.entries.find(e => e.suffix === s)?.classificationReview) !== JSON.stringify(next.entries.find(e => e.suffix === s)?.classificationReview)) : [],
    classificationChanges: old ? [...after].filter(s => JSON.stringify(old.entries.find(e => e.suffix === s)?.assignments) !== JSON.stringify(next.entries.find(e => e.suffix === s)?.assignments)) : [],
    unclassified: next.entries.filter(e => after.has(e.suffix) && !e.assignments.some(a => a.facet !== "region")).map(e => e.suffix),
    sources: next.sources, commercialSources: next.commercialSources?.map(({ suffixes, ...source }) => ({ ...source, count: suffixes.length })),
  };
}

export async function refreshCatalog(file: string, fetchText: (url: string) => Promise<string>, now = new Date(), rootText?: string, pslText?: string, rdapText?: string, evidence?: CatalogEvidence, apply = true): Promise<Inventory> {
  const old = await readFile(file, "utf8").then(text => JSON.parse(text) as Inventory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!evidence || !evidence.reviews) throw new Error("Commercial and classification evidence is required; no snapshot was changed");
  const saved = [rootText, pslText, rdapText].filter(value => value !== undefined).length;
  if (saved !== 0 && saved !== 3) throw new Error("Provide all three saved IANA, PSL and RDAP inputs");
  const pslCapturedAt = old?.sources.find(source => source.url === PSL_SOURCE)?.capturedAt ?? old?.checkedAt;
  if (!saved && pslCapturedAt && now.getTime() - Date.parse(pslCapturedAt) < 86400000) throw new Error("PSL was captured less than 24 hours ago; reuse the bundled snapshot.");
  const texts = saved ? [rootText!, pslText!, rdapText!] : await Promise.all([fetchText(ROOT_SOURCE), fetchText(PSL_SOURCE), fetchText(RDAP_SOURCE)]);
  const urls = [ROOT_SOURCE, PSL_SOURCE, RDAP_SOURCE];
  const captures = texts.map((text, index) => {
    const sha256 = hash(text);
    const explicit = evidence.captures?.find(c => c.url === urls[index]);
    if (explicit && (explicit.sha256 !== sha256 || !Number.isFinite(Date.parse(explicit.capturedAt)))) throw new Error(`Capture metadata does not match input: ${urls[index]}`);
    const previous = old?.sources.find(c => c.url === urls[index] && c.sha256 === sha256);
    return { url: urls[index]!, sha256, capturedAt: saved ? explicit?.capturedAt ?? (previous ? previous.capturedAt ?? old!.checkedAt : undefined) : now.toISOString() };
  });
  if (captures.some(c => !c.capturedAt)) throw new Error("Saved inputs require original capture dates and content hashes");
  const checkedAt = captures.map(c => c.capturedAt!).sort((a, b) => Date.parse(a) - Date.parse(b))[0]!;
  const raw = buildInventory(texts[0]!, texts[1]!, checkedAt, texts[2]);
  raw.sources = captures;
  raw.generatedAt = now.toISOString();
  const data = buildCatalogSnapshot(raw, evidence.commercial, evidence.editorial);
  data.checkerSignatures = await checkerSignatures();
  applyReviewEvidence(data, evidence.reviews);
  data.version = hash(JSON.stringify(data)).slice(0, 16);
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
  if (!input || (mode !== undefined && mode !== "--apply") || extra.length) throw new Error("Usage: bun run catalog:update <input-directory> [--apply]. Preview is the default; all eight saved evidence files are required.");
  const sourceDir = resolve(input);
  const [root, psl, rdap, commercial, overrides, regions, captures, reviews] = await Promise.all(["roots.txt", "public_suffix_list.dat", "rdap.json", "commercial.json", "overrides.json", "regions.json", "captures.json", "reviews.json"].map(name => readFile(join(sourceDir, name), "utf8")));
  const file = resolve(import.meta.dir, "../src/extensions/data/catalog.json");
  const old = JSON.parse(await readFile(file, "utf8")) as Inventory;
  const data = await refreshCatalog(file, async () => { throw new Error("Saved-input refresh must not download data"); }, new Date(), root, psl, rdap, { captures: JSON.parse(captures!), reviews: JSON.parse(reviews!), commercial: JSON.parse(commercial!), editorial: { overrides: JSON.parse(overrides!), regions: JSON.parse(regions!) } }, mode === "--apply");
  console.log(JSON.stringify({ applied: mode === "--apply", ...catalogChanges(old, data) }, null, 2));
}
