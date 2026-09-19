import { findRdapBootstrapKey } from "../../src/utils/domain.ts";
import { createBootstrapCache } from "../../src/checker/bootstrap-cache.ts";

// Serverless adapter: same HTTP policy, no home-directory or disk writes.
const cache = createBootstrapCache();
export const getBootstrap = () => cache.get();
export function getRdapUrl(map: Map<string, string>, tld: string): string | null {
  return map.get(tld.toLowerCase()) ?? null;
}
export interface RdapBootstrapMatch { rdapKey: string; rdapUrl: string | null }
export function getRdapMatch(map: Map<string, string>, domain: string): RdapBootstrapMatch {
  const rdapKey = findRdapBootstrapKey(domain, key => map.has(key));
  return { rdapKey, rdapUrl: map.get(rdapKey) ?? null };
}
