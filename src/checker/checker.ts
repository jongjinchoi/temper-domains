import { getBootstrap } from "./bootstrap.ts";
import { checkDomainBatch } from "./batch.ts";
import type { CheckOptions } from "./stream.ts";
import { DEFAULT_TLDS, type DomainResult } from "./types.ts";
import { isValidDomainLabel, sanitizeDomain } from "../utils/validate.ts";

export interface SuggestionResultGroup {
  name: string;
  results: DomainResult[];
}

interface SuggestionMatrixOptions extends CheckOptions {
  rdapUrls?: Map<string, string>;
  onResult?: (name: string, result: DomainResult) => void;
}

interface DomainSearchOptions extends CheckOptions {
  rdapUrls?: Map<string, string>;
}

export async function* checkDomains(name: string, tlds: readonly string[] = DEFAULT_TLDS,
  options: DomainSearchOptions = {}): AsyncGenerator<DomainResult> {
  const safeName = sanitizeDomain(name).toLowerCase();
  if (!isValidDomainLabel(safeName)) throw new Error("Invalid domain label");
  yield* checkFullDomains(tlds.map(tld => `${safeName}.${tld}`), options);
}

export async function* checkFullDomains(domains: readonly string[], options: DomainSearchOptions = {}): AsyncGenerator<DomainResult> {
  const { rdapUrls, ...checkOptions } = options;
  yield* checkDomainBatch(domains.map(domain => sanitizeDomain(domain).toLowerCase()), checkOptions,
    () => rdapUrls ? Promise.resolve(rdapUrls) : getBootstrap());
}

export async function checkSuggestionMatrix(
  names: readonly string[],
  tlds: readonly string[],
  options: SuggestionMatrixOptions = {},
): Promise<SuggestionResultGroup[]> {
  const { onResult, ...checkOptions } = options;
  const domainToName = new Map<string, string>();
  const domains = names.flatMap((name) => {
    const safeName = sanitizeDomain(name).toLowerCase();
    return tlds.map((tld) => {
      const domain = `${safeName}.${tld}`;
      domainToName.set(domain, safeName);
      return domain;
    });
  });
  const results: DomainResult[] = [];

  for await (const result of checkFullDomains(domains, checkOptions)) {
    results.push(result);
    const name = domainToName.get(result.domain);
    if (name) onResult?.(name, result);
  }

  const byDomain = new Map(results.map((result) => [result.domain, result]));
  return names.map((rawName) => {
    const name = sanitizeDomain(rawName).toLowerCase();
    return {
      name,
      results: tlds
        .map((tld) => byDomain.get(`${name}.${tld}`))
        .filter((result): result is DomainResult => !!result),
    };
  });
}
