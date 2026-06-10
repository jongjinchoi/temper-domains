import { parseDomain } from "./domain.ts";

export function sanitizeDomain(input: string): string {
  return input.replace(/[\r\n\t]/g, "").trim();
}

export function isValidDomainLabel(label: string): boolean {
  const asciiLabel = parseDomain(label).asciiDomain;
  if (asciiLabel.length === 0 || asciiLabel.length > 63) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(asciiLabel);
}

export function isValidDomain(domain: string): boolean {
  const parsed = parseDomain(domain);
  if (parsed.asciiDomain.length === 0 || parsed.asciiDomain.length > 253) return false;
  const labels = parsed.labels;
  if (labels.length < 2) return false;
  return labels.every(isValidDomainLabel);
}
