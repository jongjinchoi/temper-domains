import { getDomainInputError } from "../checker/policy.ts";
import { filterExtensions, inventory, lookupSupport } from "./catalog.ts";
import { normalizeSuffix } from "./boundary.ts";
import type { CatalogFilters } from "./types.ts";

export const MAX_SELECTED_CANDIDATES = 480;

export function normalizeSuffixSelection(raw: readonly string[]): string[] {
  if (!raw.length) throw new Error("Provide at least one extension");
  return [...new Set(raw.map(value => normalizeSuffix(value, inventory)))];
}

export function resolveExplicitSelection(raw: readonly string[]): string[] {
  const suffixes = normalizeSuffixSelection(raw);
  for (const suffix of suffixes) {
    if (lookupSupport(suffix) === "unsupported") throw new Error(`No supported RDAP/WHOIS lookup route for .${suffix} in this catalog snapshot`);
  }
  return suffixes;
}

export function assertCandidateLimit(names: number, suffixes: number): void {
  const count = names * suffixes;
  if (count > MAX_SELECTED_CANDIDATES) throw new Error(`${count} domain candidates exceed the limit of ${MAX_SELECTED_CANDIDATES}; choose fewer names or extensions`);
}

export function resolveCategorySelection(filters: CatalogFilters): string[] {
  const matches = filterExtensions(filters);
  if (!matches.length) throw new Error("No extensions match these classifications; choose another filter");
  // Never silently drop unverified entries or widen to the default list.
  return resolveExplicitSelection(matches.map(e => e.suffix));
}

export function validateSearchCombinations(names: readonly string[], suffixes: readonly string[]): void {
  for (const name of names) for (const suffix of suffixes) {
    const domain = `${name}.${suffix}`;
    const error = getDomainInputError(domain);
    if (error) throw new Error(`${domain}: ${error}`);
  }
}
