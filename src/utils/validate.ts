import { domainToASCII } from "node:url";

// Reject URL syntax before conversion can discard it or decode it as a host.
const FORBIDDEN_INPUT = /[\u0000-\u0020\u007f/\\?#@:%\[\]]/u;

function isValidAsciiLabel(label: string): boolean {
  return label.length > 0 && label.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label);
}

export function sanitizeDomain(input: string): string {
  return input.replace(/[\r\n\t]/g, "").trim();
}

export function normalizeDomainKey(input: string): string {
  return sanitizeDomain(input).toLowerCase();
}

export function isValidDomainLabel(label: string): boolean {
  const clean = sanitizeDomain(label);
  if (!clean || clean.includes(".") || FORBIDDEN_INPUT.test(clean)) return false;
  // A fixed suffix keeps numeric labels out of URL host IPv4 interpretation.
  const suffix = ".invalid";
  const ascii = domainToASCII(`${clean}${suffix}`);
  return ascii.endsWith(suffix) && isValidAsciiLabel(ascii.slice(0, -suffix.length));
}

export function isValidDomain(domain: string): boolean {
  const clean = sanitizeDomain(domain);
  if (!clean || FORBIDDEN_INPUT.test(clean)) return false;
  const ascii = domainToASCII(clean);
  if (ascii.length === 0 || ascii.length > 253) return false;
  const labels = ascii.split(".");
  if (labels.length < 2) return false;
  return labels.every(isValidAsciiLabel);
}
