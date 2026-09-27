import { getDomainInputError } from "../checker/policy.ts";

export const MAX_SELECTED_CANDIDATES = 480;

export function assertCandidateLimit(names: number, suffixes: number): void {
  const count = names * suffixes;
  if (count > MAX_SELECTED_CANDIDATES) throw new Error(`${count} domain candidates exceed the limit of ${MAX_SELECTED_CANDIDATES}; choose fewer names or extensions`);
}

export function validateSearchCombinations(names: readonly string[], suffixes: readonly string[]): void {
  for (const name of names) for (const suffix of suffixes) {
    const domain = `${name}.${suffix}`;
    const error = getDomainInputError(domain);
    if (error) throw new Error(`${domain}: ${error}`);
  }
}

export function splitFilter(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(",").map(s => s.trim());
  if (parts.some(s => !s)) throw new Error("Classification filters must not contain empty values");
  return [...new Set(parts)];
}
