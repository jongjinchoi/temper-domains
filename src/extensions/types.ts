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
  classificationReview?: ClassificationReview;
  lookupVerification?: LookupVerification[];
  namespace?: { reason: string; source: string };
  offers?: { provider: string; source: string; checkedAt: string }[];
  provenance: string[];
  checkedAt: string;
}
export interface Inventory {
  version: string;
  generatedAt?: string;
  checkerSignatures?: { rdap: string; whois: string };
  reviewSources?: Record<string, ReviewSource>;
  checkedAt: string;
  sources: { url: string; sha256: string; capturedAt?: string }[];
  roots: string[];
  rules: string[];
  rdapKeys: string[];
  lookupPlans?: Record<string, import("../checker/services.ts").LookupPlan>;
  rdapEndpoints?: Record<string, string[]>;
  entries: ExtensionEntry[];
  commercialSources?: CommercialSource[];
}
export interface Category { id: string; name: string; nameKo: string; description: string; inclusion?: string; exclusion?: string }
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

export interface SourceCapture { url: string; sha256: string; capturedAt: string }
export interface ReviewSource extends SourceCapture { locator: string; claim: string }
export interface ClassificationReview {
  state: 'unreviewed' | 'assigned' | 'deferred';
  sources: string[];
  sourceHashes: Record<string, string>;
  rationale: string;
  reviewedAt?: string;
  rulesVersion: string;
  assignmentsHash: string;
}
export interface LookupVerification {
  checkedAt: string;
  routeHash: string;
  route?: import("../checker/services.ts").LookupPlan;
  codeRevision?: string;
  checkerHash: string;
  runtime: string;
  domain: string;
  status: string;
  attempts: number;
  error?: string;
}
export interface ReviewEvidence {
  sources: Record<string, ReviewSource>;
  classifications: Record<string, ClassificationReview>;
  lookups: Record<string, LookupVerification[]>;
}
