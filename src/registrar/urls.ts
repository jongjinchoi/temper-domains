export const REGISTRAR_URLS = {
  cloudflare: "https://domains.cloudflare.com/?domainToCheck=%s",
  porkbun: "https://porkbun.com/checkout/search?q=%s",
  namecheap: "https://www.namecheap.com/domains/registration/results/?domain=%s",
  vercel: "https://vercel.com/domains/%s",
} as const;

export type Registrar = keyof typeof REGISTRAR_URLS;

export interface RegistrarInfo {
  key: Registrar;
  hotkey: string;
  label: string;
  description: string;
}

export const REGISTRAR_META: RegistrarInfo[] = [
  { key: "cloudflare", hotkey: "c", label: "Cloudflare", description: "At-cost pricing" },
  { key: "porkbun", hotkey: "p", label: "Porkbun", description: "No upsells" },
  { key: "namecheap", hotkey: "n", label: "Namecheap", description: "Beginner friendly" },
  { key: "vercel", hotkey: "v", label: "Vercel", description: "Deploy in one step" },
];

export function buildURL(registrar: Registrar, domain: string): string {
  return REGISTRAR_URLS[registrar].replace("%s", encodeURIComponent(domain));
}
