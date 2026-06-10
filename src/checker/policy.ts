import type { DomainResult, ResultConfidence } from "./types.ts";
import { parseDomain } from "../utils/domain.ts";

export interface DomainMetadata {
  tld: string;
  rdapKey?: string;
  publicSuffix?: string;
  registrableDomain?: string;
}

interface AvailabilityPolicy {
  confidence: ResultConfidence;
  reason?: string;
}

const PRIVATE_SUFFIX_REASON =
  "Public suffix is privately operated; registrar availability may not match RDAP object lookup";

const PUBLIC_SUFFIX_REASON =
  "Input is a public suffix, not a registrable domain";

const RDAP_NOT_FOUND_REASON =
  "RDAP returned no domain object; confirm final purchase availability with a registrar";

export function getDomainMetadata(domain: string, rdapKey?: string): DomainMetadata {
  const parsed = parseDomain(domain);
  return {
    tld: parsed.tld,
    rdapKey,
    publicSuffix: parsed.publicSuffix,
    registrableDomain: parsed.registrableDomain,
  };
}

export function getDomainInputError(domain: string): string | null {
  const parsed = parseDomain(domain);
  if (!parsed.asciiDomain || parsed.labels.length < 2) return "Invalid domain";
  if (!parsed.registrableDomain) return PUBLIC_SUFFIX_REASON;
  if (parsed.registrableDomain !== parsed.asciiDomain) return "Subdomain availability is not a registrable-domain check";
  return null;
}

function getAvailabilityPolicy(result: DomainResult): AvailabilityPolicy {
  if (result.status === "taken") {
    return { confidence: "high", reason: "RDAP/WHOIS returned a domain object" };
  }

  if (result.status === "available") {
    if (!result.registrableDomain) {
      return { confidence: "low", reason: PUBLIC_SUFFIX_REASON };
    }

    if (result.publicSuffix && result.publicSuffix === result.domain) {
      return { confidence: "low", reason: PUBLIC_SUFFIX_REASON };
    }

    if (result.method === "rdap") {
      return { confidence: "medium", reason: RDAP_NOT_FOUND_REASON };
    }

    return { confidence: "medium", reason: "WHOIS response matched an availability pattern" };
  }

  if (result.status === "premium" || result.status === "reserved") {
    return { confidence: "high" };
  }

  return { confidence: "low" };
}

export function enrichDomainResult(result: DomainResult, rdapKey?: string): DomainResult {
  const metadata = getDomainMetadata(result.domain, rdapKey);
  const policy = getAvailabilityPolicy({ ...result, ...metadata });
  const parsed = parseDomain(result.domain);
  const reason = parsed.isPrivate
    ? [PRIVATE_SUFFIX_REASON, policy.reason].filter(Boolean).join("; ")
    : policy.reason;

  return {
    ...result,
    ...metadata,
    confidence: result.confidence ?? policy.confidence,
    reason: result.reason ?? reason,
  };
}
