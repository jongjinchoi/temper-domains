import { createHash } from "node:crypto";
import { domainToASCII, domainToUnicode } from "node:url";
import { parseDomain } from "../utils/domain.ts";
import type { Inventory } from "./types.ts";

export const ROOT_SOURCE = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";
export const PSL_SOURCE = "https://publicsuffix.org/list/public_suffix_list.dat";
export const RDAP_SOURCE = "https://data.iana.org/rdap/dns.json";
export const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function buildInventory(rootText: string, pslText: string, checkedAt: string, rdapText?: string): Inventory {
  const roots = rootText.split(/\r?\n/).filter(s => s && !s.startsWith("#")).map(s => s.trim().toLowerCase());
  if (!roots.length || new Set(roots).size !== roots.length || roots.some(s => !/^[a-z0-9-]+$/.test(s))) throw new Error("Invalid or duplicate IANA roots");
  const section = pslText.split("// ===BEGIN ICANN DOMAINS===")[1]?.split("// ===END ICANN DOMAINS===")[0];
  if (!section || !pslText.includes("// ===END ICANN DOMAINS===")) throw new Error("Missing PSL ICANN section");
  const rules = section.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("//")).map(s => {
    const prefix = s.startsWith("*.") ? "*." : s.startsWith("!") ? "!" : "";
    const body = domainToASCII(s.slice(prefix.length));
    if (!body || !body.split(".").every(l => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l))) throw new Error(`Invalid PSL rule: ${s}`);
    return prefix + body;
  });
  if (!rules.length || new Set(rules).size !== rules.length) throw new Error("Empty or duplicate PSL rules");
  const rootSet = new Set(roots);
  const suffixes = [...new Set([...roots, ...rules.filter(r => !r.startsWith("*") && !r.startsWith("!") && rootSet.has(r.split(".").at(-1)!))])].sort();
  const sources = [{ url: ROOT_SOURCE, sha256: hash(rootText) }, { url: PSL_SOURCE, sha256: hash(pslText) }];
  let rdapKeys: string[] = [];
  if (rdapText !== undefined) {
    const data = JSON.parse(rdapText);
    if (!Array.isArray(data.services) || !data.services.length) throw new Error("Invalid RDAP bootstrap snapshot");
    for (const service of data.services) {
      if (!Array.isArray(service) || !Array.isArray(service[0]) || !service[0].every((key: unknown) => typeof key === "string") || !Array.isArray(service[1]) || !service[1].some((url: unknown) => typeof url === "string" && /^https?:\/\//.test(url))) throw new Error("Invalid RDAP service");
      rdapKeys.push(...service[0]);
    }
    rdapKeys = [...new Set(rdapKeys)].sort();
    sources.push({ url: RDAP_SOURCE, sha256: hash(rdapText) });
  }
  return {
    version: hash(JSON.stringify(sources)).slice(0, 16), checkedAt, sources, roots: roots.sort(), rules, rdapKeys,
    entries: suffixes.map(suffix => {
      const parsed = parseDomain(`temper-boundary-probe.${suffix}`);
      const direct = parsed.isIcann && !parsed.isPrivate && parsed.publicSuffix === suffix && parsed.registrableDomain === parsed.asciiDomain;
      return {
        suffix, displaySuffix: domainToUnicode(suffix), rootTld: suffix.split(".").at(-1)!,
        boundaryState: direct ? "direct" : "unknown", assignments: [],
        provenance: suffix.includes(".") ? [PSL_SOURCE, ROOT_SOURCE] : [ROOT_SOURCE, PSL_SOURCE], checkedAt,
      };
    }),
  };
}
