import { getBootstrap, getRdapMatch, getRdapUrl } from "./bootstrap.ts";
import { lookupDomainAvailability } from "./lookup.ts";
import { enrichDomainResult, getDomainInputError } from "./policy.ts";
import { streamDomainResults, type CheckOptions } from "./stream.ts";
import type { DomainResult } from "./types.ts";
import { DEFAULT_TLDS } from "./types.ts";
import { findRdapBootstrapKey, getTld } from "../utils/domain.ts";
import { isValidDomain, sanitizeDomain } from "../utils/validate.ts";

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

function getInjectedRdapMatch(domain: string, rdapUrls: Map<string, string>): { rdapKey: string; rdapUrl: string | null } {
  const rdapKey = findRdapBootstrapKey(domain, (key) => rdapUrls.has(key.toLowerCase()));
  return {
    rdapKey,
    rdapUrl: rdapUrls.get(rdapKey.toLowerCase()) ?? null,
  };
}

export async function* checkDomains(
  name: string,
  tlds: readonly string[] = DEFAULT_TLDS,
  options: DomainSearchOptions = {},
): AsyncGenerator<DomainResult> {
  const { rdapUrls, ...checkOptions } = options;
  const { timeoutMs = 3000 } = checkOptions;
  if (!rdapUrls) await getBootstrap();

  const safeName = sanitizeDomain(name);
  const domains = tlds.map((tld) => `${safeName}.${tld}`);
  yield* streamDomainResults(domains, checkOptions, async (domain, signal) => {
    const match = rdapUrls ? getInjectedRdapMatch(domain, rdapUrls) : getRdapMatch(domain);
    return lookupDomainAvailability(domain, match.rdapUrl, signal, timeoutMs, match.rdapKey);
  });
}

export async function* checkFullDomains(
  domains: readonly string[],
  options: CheckOptions & { rdapUrls?: Map<string, string> } = {},
): AsyncGenerator<DomainResult> {
  const { rdapUrls, ...checkOptions } = options;
  const { timeoutMs = 3000 } = checkOptions;

  if (!rdapUrls) await getBootstrap();

  const safeDomains = domains.map((domain) => sanitizeDomain(domain).toLowerCase());
  yield* streamDomainResults(safeDomains, checkOptions, async (domain, signal) => {
    const tld = getTld(domain);
    const match = rdapUrls
      ? getInjectedRdapMatch(domain, rdapUrls)
      : getRdapMatch(domain);
    const rdapUrl = match.rdapUrl ?? getRdapUrl(tld);
    const inputError = getDomainInputError(domain);

    if (!isValidDomain(domain) || inputError) {
      return enrichDomainResult({
        domain,
        tld,
        status: "error",
        method: rdapUrl ? "rdap" : "whois",
        responseTime: 0,
        error: inputError ?? "Invalid domain",
      }, match.rdapKey);
    }

    return lookupDomainAvailability(domain, rdapUrl, signal, timeoutMs, match.rdapKey);
  });
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
