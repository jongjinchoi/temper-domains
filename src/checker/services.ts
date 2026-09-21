import { findRdapBootstrapKey, getTld } from '../utils/domain.ts';

export const WHOIS_PROFILES: Record<string, { host: string; parser: 'standard' | 'cr' | 'sr' | 'sn'; preferred?: boolean; source: string }> = {
  io: { host: 'whois.nic.io', parser: 'standard', source: 'https://www.iana.org/domains/root/db/io.html' },
  co: { host: 'whois.registry.co', parser: 'standard', source: 'https://www.iana.org/domains/root/db/co.html' },
  me: { host: 'whois.nic.me', parser: 'standard', source: 'https://www.iana.org/domains/root/db/me.html' },
  gg: { host: 'whois.gg', parser: 'standard', source: 'https://www.iana.org/domains/root/db/gg.html' },
  sh: { host: 'whois.nic.sh', parser: 'standard', source: 'https://www.iana.org/domains/root/db/sh.html' },
  so: { host: 'whois.nic.so', parser: 'standard', source: 'https://www.iana.org/domains/root/db/so.html' },
  // Official servers and both registered/not-found responses verified 2026-09-22.
  cr: { host: 'whois.nic.cr', parser: 'cr', preferred: true, source: 'https://www.iana.org/domains/root/db/cr.html' },
  sr: { host: 'whois.sr', parser: 'sr', preferred: true, source: 'https://www.iana.org/domains/root/db/sr.html' },
  sn: { host: 'whois.nic.sn', parser: 'sn', preferred: true, source: 'https://www.iana.org/domains/root/db/sn.html' },
};
export type RouteRegistry = Map<string, string> & { endpoints?: Map<string, readonly string[]> };
export interface LookupPlan { key: string; method: 'rdap' | 'whois' | 'unsupported'; endpoints: readonly string[]; parser: string }
export function lookupPlan(domain: string, registry: RouteRegistry): LookupPlan {
  const key = findRdapBootstrapKey(domain, key => registry.has(key));
  const profile = WHOIS_PROFILES[getTld(domain)];
  if (!profile?.preferred && registry.has(key)) return { key, method: 'rdap', endpoints: registry.endpoints?.get(key) ?? [registry.get(key)!], parser: 'rdap-domain-v1' };
  if (profile) return { key, method: 'whois', endpoints: [`whois://${profile.host}:43`], parser: `whois-${profile.parser}-v2` };
  return { key, method: 'unsupported', endpoints: [], parser: '' };
}
