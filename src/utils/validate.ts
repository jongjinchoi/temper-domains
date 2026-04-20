export function sanitizeDomain(input: string): string {
  return input.replace(/[\r\n\t]/g, "").trim();
}

export function isValidDomainLabel(label: string): boolean {
  if (label.length === 0 || label.length > 63) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label);
}

export function isValidDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  return labels.every(isValidDomainLabel);
}
