import { DEFAULT_PREFIXES, DEFAULT_SUFFIXES } from "../checker/types.ts";
import { isValidDomainLabel, normalizeDomainKey } from "./validate.ts";

export function parseAffixes(value: string): string[] {
  const parts = value.split(",").map(part => part.trim());
  const empty = parts.findIndex(part => !part);
  if (empty >= 0) throw new Error(`Empty affix at position ${empty + 1}`);
  return parts;
}

export function buildSuggestions(query: string, prefixes: readonly string[] = DEFAULT_PREFIXES, suffixes: readonly string[] = DEFAULT_SUFFIXES) {
  const seen = new Set<string>();
  const unique = (names: string[]) => names.filter(name => {
    if (!isValidDomainLabel(name)) throw new Error(`Invalid suggestion '${name}': expected a valid domain label of at most 63 ASCII bytes`);
    const key = normalizeDomainKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const affix of [...prefixes, ...suffixes]) {
    if (!affix.trim()) throw new Error("Empty affix is not allowed");
  }
  const base = unique([query]);
  const prefix = unique(prefixes.map(p => `${p.trim()}${query}`));
  const suffix = unique(suffixes.map(s => `${query}${s.trim()}`));
  return { base, prefix, suffix, names: [...base, ...prefix, ...suffix] };
}
