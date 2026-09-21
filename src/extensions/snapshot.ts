import { domainToASCII, domainToUnicode } from "node:url";
import { hash } from "./inventory.ts";
import { normalizeSuffix, lookupRoute } from "./boundary.ts";
import { INDUSTRIES, PURPOSES } from "./taxonomy.ts";
import type { CommercialSource, EditorialData, ExtensionEntry, Inventory } from "./types.ts";

function validDate(value: string): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function validSource(value: string): boolean { return typeof value === "string" && value.startsWith("https://"); }

export function validateCommercialSources(sources: CommercialSource[]): void {
  if (!Array.isArray(sources) || sources.length < 2 || new Set(sources.map(s => s.provider)).size !== sources.length) throw new Error("Provide complete commercial snapshots from at least two distinct providers");
  for (const source of sources) {
    if (!source.provider || !validSource(source.source) || !validDate(source.checkedAt) || !Array.isArray(source.suffixes) || !source.suffixes.length || new Set(source.suffixes).size !== source.suffixes.length) throw new Error("Invalid or empty commercial source");
    for (const suffix of source.suffixes) {
      if (typeof suffix !== "string" || domainToASCII(suffix).toLowerCase() !== suffix || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(suffix)) throw new Error(`Invalid offered suffix: ${suffix}`);
    }
    for (const [suffix, url] of Object.entries(source.sourceBySuffix ?? {})) {
      if (!source.suffixes.includes(suffix) || !validSource(url)) throw new Error(`Invalid offering evidence: ${suffix}`);
    }
  }
}

// A single generated file contains the boundary, offering and classification
// evidence. Runtime readers never combine independently updated input files.
export function buildCatalogSnapshot(inventory: Inventory, sources: CommercialSource[], editorial: EditorialData): Inventory {
  validateCommercialSources(sources);
  const entries = new Map<string, ExtensionEntry>(inventory.entries.map(e => [e.suffix, {
    suffix: e.suffix, displaySuffix: e.displaySuffix, rootTld: e.rootTld,
    boundaryState: e.boundaryState, assignments: [], provenance: e.provenance, checkedAt: e.checkedAt,
  }]));
  for (const source of sources) for (const suffix of source.suffixes) {
    // Concrete wildcard registration products need not have an exact PSL rule.
    if (!entries.has(suffix)) entries.set(suffix, {
      suffix, displaySuffix: domainToUnicode(suffix), rootTld: suffix.split(".").at(-1)!,
      boundaryState: "unknown", assignments: [], provenance: inventory.sources.map(s => s.url), checkedAt: inventory.checkedAt,
    });
    const entry = entries.get(suffix)!;
    (entry.offers ??= []).push({ provider: source.provider, source: source.sourceBySuffix?.[suffix] ?? source.source, checkedAt: source.checkedAt });
  }
  const regionIds = new Set<string>();
  const roots = new Set<string>();
  for (const region of editorial.regions) {
    if (roots.has(region.root) || !/^[A-Z]{2}$/.test(region.region) || !validSource(region.source) || !validDate(region.checkedAt)) throw new Error(`Invalid region evidence: ${region.root}`);
    roots.add(region.root); regionIds.add(region.region);
  }
  for (const [suffix, override] of Object.entries(editorial.overrides)) {
    const entry = entries.get(suffix);
    if (!entry) throw new Error(`Curated suffix missing from source inventory: ${suffix}`);
    if (Object.keys(override).some(key => !["namespace", "assignments"].includes(key))) throw new Error(`Unsupported editorial field: ${suffix}`);
    if (override.namespace && (!override.namespace.reason || !validSource(override.namespace.source))) throw new Error(`Invalid namespace evidence: ${suffix}`);
    Object.assign(entry, override);
  }
  for (const entry of entries.values()) {
    const region = editorial.regions.find(r => r.root === entry.rootTld);
    entry.assignments = [...entry.assignments];
    if (region) entry.assignments.push({ facet: "region", id: region.region, reason: `Country-code namespace .${entry.rootTld}; geographic association.`, source: region.source, evidenceType: "registry-purpose", checkedAt: region.checkedAt });
    const seen = new Set<string>();
    for (const assignment of entry.assignments) {
      const ids = assignment.facet === "industry" ? INDUSTRIES.map(c => c.id) : assignment.facet === "purpose" ? PURPOSES.map(c => c.id) : assignment.facet === "region" ? [...regionIds] : [];
      const key = `${assignment.facet}:${assignment.id}`;
      if (seen.has(key) || !ids.includes(assignment.id) || !assignment.reason || !validSource(assignment.source) || !validDate(assignment.checkedAt) || !["registry-purpose", "documented-use", "editorial"].includes(assignment.evidenceType)) throw new Error(`Invalid classification evidence: ${entry.suffix} ${key}`);
      seen.add(key);
    }
  }
  const snapshot: Inventory = { ...inventory, commercialSources: sources, entries: [...entries.values()].sort((a, b) => a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0) };
  for (const entry of snapshot.entries) {
    try { normalizeSuffix(entry.suffix, snapshot); entry.boundaryState = "direct"; } catch { entry.boundaryState = "unknown"; }
  }
  snapshot.version = hash(JSON.stringify({ sources: inventory.sources, commercial: sources, editorial })).slice(0, 16);
  return snapshot;
}

export function supportedSuffixes(snapshot: Inventory): string[] {
  return snapshot.entries.filter(e => e.offers?.length && e.boundaryState === "direct" && lookupRoute(e.suffix, snapshot) !== "unsupported").map(e => e.suffix);
}
