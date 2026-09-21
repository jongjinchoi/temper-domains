export type Facet = "industry" | "purpose" | "region";
export interface Assignment {
  facet: Facet;
  id: string;
  reason: string;
  source: string;
  evidenceType: "registry-purpose" | "documented-use" | "editorial";
  checkedAt: string;
}
export interface ExtensionEntry {
  suffix: string;
  displaySuffix: string;
  rootTld: string;
  boundaryState: "direct" | "unknown";
  assignments: Assignment[];
  namespace?: { reason: string; source: string };
  offers?: { provider: string; source: string; checkedAt: string }[];
  provenance: string[];
  checkedAt: string;
}
export interface Inventory {
  version: string;
  checkedAt: string;
  sources: { url: string; sha256: string }[];
  roots: string[];
  rules: string[];
  rdapKeys: string[];
  entries: ExtensionEntry[];
  commercialSources?: CommercialSource[];
}
export interface Category { id: string; name: string; nameKo: string; description: string }
export interface CatalogFilters { query?: string; industries?: string[]; purposes?: string[]; regions?: string[] }

export interface CommercialSource {
  provider: string;
  source: string;
  checkedAt: string;
  suffixes: string[];
  sourceBySuffix?: Record<string, string>;
}
export interface EditorialData {
  overrides: Record<string, Partial<Pick<ExtensionEntry, "assignments" | "namespace">>>;
  regions: { root: string; region: string; source: string; checkedAt: string }[];
}
