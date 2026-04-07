export function sanitizeDomain(input: string): string {
  return input.replace(/[\r\n\t]/g, "").trim();
}

export function isValidDomainLabel(label: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label);
}
