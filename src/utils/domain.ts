import { domainToASCII } from "node:url";
import { parse as parseTld } from "tldts";

export interface ParsedDomain {
  input: string;
  asciiDomain: string;
  labels: string[];
  tld: string;
  publicSuffix?: string;
  registrableDomain?: string;
  isIcann?: boolean;
  isPrivate?: boolean;
}

export function parseDomain(input: string): ParsedDomain {
  const trimmed = input.replace(/[\r\n\t]/g, "").trim().replace(/\.+$/, "");
  const asciiDomain = domainToASCII(trimmed).toLowerCase();
  const labels = asciiDomain ? asciiDomain.split(".").filter(Boolean) : [];
  const parsed = asciiDomain
    ? parseTld(asciiDomain, { allowPrivateDomains: true, extractHostname: false })
    : null;

  return {
    input: trimmed,
    asciiDomain,
    labels,
    tld: labels[labels.length - 1] ?? "",
    publicSuffix: parsed?.publicSuffix ?? undefined,
    registrableDomain: parsed?.domain ?? undefined,
    isIcann: parsed?.isIcann ?? undefined,
    isPrivate: parsed?.isPrivate ?? undefined,
  };
}

export function getTld(domain: string): string {
  return parseDomain(domain).tld;
}

export function findRdapBootstrapKey(
  domain: string,
  hasBootstrapKey: (key: string) => boolean,
): string {
  const parsed = parseDomain(domain);
  for (let index = 0; index < parsed.labels.length; index++) {
    const key = parsed.labels.slice(index).join(".");
    if (hasBootstrapKey(key)) return key;
  }
  return parsed.tld;
}
