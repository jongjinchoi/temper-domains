export function getTld(domain: string): string {
  const parts = domain.split(".");
  return parts[parts.length - 1] ?? "";
}
