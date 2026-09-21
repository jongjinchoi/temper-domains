import { domainToASCII } from "node:url";
import snapshot from "./data/catalog.json";
import { hash } from "./inventory.ts";
import { INDUSTRIES, PURPOSES, FACETS } from "./taxonomy.ts";
import type { CatalogFilters, Category, ExtensionEntry, Facet, Inventory } from "./types.ts";
import { lookupRoute, normalizeSuffix } from "./boundary.ts";

export const inventory = snapshot as Inventory;
export const catalogVersion = hash(JSON.stringify(inventory) + JSON.stringify([INDUSTRIES, PURPOSES]) + JSON.stringify(inventory.entries.map(e => lookupRoute(e.suffix, inventory)))).slice(0, 16);
const enRegions = new Intl.DisplayNames(["en"], { type: "region" });
const koRegions = new Intl.DisplayNames(["ko"], { type: "region" });
export const entries: ExtensionEntry[] = inventory.entries;
export const entryBySuffix = new Map(entries.map(e => [e.suffix, e]));
export function lookupSupport(suffix: string): "rdap" | "whois" | "unsupported" {
  return lookupRoute(suffix, inventory);
}
export const supportedEntries = entries.filter(e => {
  if (!e.offers?.length || lookupSupport(e.suffix) === "unsupported") return false;
  try { return normalizeSuffix(e.suffix, inventory) === e.suffix; } catch { return false; }
}).sort((a, b) => a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0);
const regionCategories: Category[] = [...new Set(supportedEntries.flatMap(e => e.assignments.filter(a => a.facet === "region").map(a => a.id)))].sort().map(id => ({ id, name: enRegions.of(id) ?? id, nameKo: koRegions.of(id) ?? id, description: "Geographic association" }));

export function categoriesFor(facet: Facet): Category[] {
  if (facet === "industry") return INDUSTRIES;
  if (facet === "purpose") return PURPOSES;
  if (facet !== "region") throw new Error(`Unknown classification facet: ${facet}`);
  return regionCategories;
}

// Validate curated evidence at startup, so bad data cannot silently alter searches.
for (const entry of supportedEntries) {
  const seen = new Set<string>();
  for (const a of entry.assignments) {
    const key = `${a.facet}:${a.id}`;
    if (seen.has(key) || !a.reason || !a.source.startsWith("https://") || !a.checkedAt || !categoriesFor(a.facet).some(c => c.id === a.id)) throw new Error(`Invalid classification evidence: ${entry.suffix} ${key}`);
    seen.add(key);
  }
}

export function catalogStats() {
  return {
    total: supportedEntries.length,
    classified: supportedEntries.filter(e => e.assignments.some(a => a.facet !== "region")).length,
    unclassified: supportedEntries.filter(e => !e.assignments.some(a => a.facet !== "region")).length,
  };
}
const metadata = () => ({ catalogVersion, checkedAt: inventory.checkedAt, ...catalogStats(), notice: "Lookup results may differ from final purchase availability. Listing extensions does not query domains." });

export function listCategories(facet: Facet) {
  const categories = categoriesFor(facet).map(category => ({ ...category, count: supportedEntries.filter(e => e.assignments.some(a => a.facet === facet && a.id === category.id)).length })).filter(category => facet !== "region" || category.count > 0);
  return { ...metadata(), facet, categories };
}
export function categoryOverview() {
  return { ...metadata(), facets: FACETS.map(f => ({ ...f, categoryCount: listCategories(f.id).categories.length, extensionCount: supportedEntries.filter(e => e.assignments.some(a => a.facet === f.id)).length, command: `temper extensions --categories ${f.id}` })) };
}

export function filterExtensions(filters: CatalogFilters = {}): ExtensionEntry[] {
  const fields = [["industry", filters.industries], ["purpose", filters.purposes], ["region", filters.regions]] as const;
  for (const [facet, ids] of fields) {
    if (ids && (!ids.length || ids.some(id => !categoriesFor(facet).some(c => c.id === id)))) throw new Error(`Unknown or empty ${facet} filter. List classifications first.`);
  }
  const query = filters.query?.trim().toLowerCase().replace(/^\./, "");
  if (filters.query !== undefined && !query) throw new Error("Query must not be empty");
  return supportedEntries.filter(e => fields.every(([facet, ids]) => !ids || ids.some(id => e.assignments.some(a => a.facet === facet && a.id === id))) && (!query || e.suffix.includes(domainToASCII(query) || query) || e.displaySuffix.includes(query)));
}

export function browseExtensions(options: CatalogFilters & { cursor?: string; limit?: number } = {}) {
  const { cursor, limit = 50, ...filters } = options;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Page limit must be an integer from 1 to 100");
  const matched = filterExtensions(filters);
  const key = hash(JSON.stringify({ catalogVersion, query: filters.query ?? null, industries: filters.industries ?? null, purposes: filters.purposes ?? null, regions: filters.regions ?? null }));
  let offset = 0;
  if (cursor !== undefined) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (decoded.key !== key || !Number.isInteger(decoded.offset) || decoded.offset < 0 || decoded.offset >= matched.length) throw new Error();
      offset = decoded.offset;
    } catch { throw new Error("Invalid or stale cursor for these filters; restart the listing"); }
  }
  const items = matched.slice(offset, offset + limit).map(e => ({ ...e, lookupSupport: lookupSupport(e.suffix) }));
  const nextCursor = offset + limit < matched.length ? Buffer.from(JSON.stringify({ key, offset: offset + limit })).toString("base64url") : null;
  return { ...metadata(), matched: matched.length, items, nextCursor };
}
