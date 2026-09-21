import { domainToASCII } from "node:url";
import { parseDomain } from "../utils/domain.ts";
import { isValidDomain } from "../utils/validate.ts";
import { getDomainInputError } from "../checker/policy.ts";
import { hasWhoisServer } from "../checker/whois.ts";
import type { Inventory } from "./types.ts";

// Pure checks shared by snapshot generation and runtime selection.
export function normalizeSuffix(raw: string, inventory: Inventory): string {
  const trimmed = raw.trim().replace(/^\./, "");
  const suffix = domainToASCII(trimmed).toLowerCase();
  if (!trimmed || /[\s/:?#@\\%]/u.test(trimmed) || !suffix || !isValidDomain(`temper-probe.${suffix}`)) throw new Error(`Invalid extension '${raw}'`);
  const root = suffix.split(".").at(-1)!;
  if (!inventory.roots.includes(root)) throw new Error(`Registration boundary is unverified for .${suffix} in this catalog`);
  const namespace = inventory.entries.find(e => e.suffix === suffix)?.namespace;
  if (namespace) throw new Error(`.${suffix} is not a supported registration namespace: ${namespace.reason}`);
  const domain = `temper-probe.${suffix}`;
  const parsed = parseDomain(domain);
  if (parsed.isPrivate) throw new Error(`.${suffix} is a private hosting namespace, not a registry registration suffix`);
  const labels = suffix.split(".");
  const declared = inventory.rules.includes(suffix) || (labels.length > 1 && inventory.rules.includes(`*.${labels.slice(1).join(".")}`) && !inventory.rules.includes(`!${suffix}`));
  if (!declared || !parsed.isIcann || parsed.publicSuffix !== suffix || getDomainInputError(domain)) throw new Error(`Registration boundary is unverified or '${suffix}' is a domain rather than a suffix`);
  return suffix;
}

export function lookupRoute(suffix: string, inventory: Inventory): "rdap" | "whois" | "unsupported" {
  const labels = suffix.split(".");
  for (let i = 0; i < labels.length; i++) if (inventory.rdapKeys.includes(labels.slice(i).join("."))) return "rdap";
  return hasWhoisServer(labels.at(-1)!) ? "whois" : "unsupported";
}
