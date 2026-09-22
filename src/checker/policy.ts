import type { DomainDetail, DomainResult, ResultConfidence, TerminationReason } from "./types.ts";
import { parseDomain, type ParsedDomain } from "../utils/domain.ts";
import { isValidDomain } from "../utils/validate.ts";

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

const TERMINATION_MESSAGES: Record<TerminationReason, string> = {
  deadline_before_start: "Time limit reached before this domain could be queried",
  deadline: "Overall time limit reached while querying this domain",
  request_timeout: "The lookup server did not respond within the request time limit",
  cancelled: "Lookup cancelled",
  server_cooldown: "Previous server limit: this request was not sent",
  limit_state_error: "Could not safely coordinate lookup requests; repair the local state before retrying",
  rate_limited: "The lookup server asked us to wait before retrying",
  service_unavailable: "The lookup service is temporarily unavailable",
  invalid_response: "The server did not return a valid matching RDAP domain response",
  network_error: "Could not complete the connection to the lookup server",
  http_error: "The lookup server returned an HTTP error",
  invalid_input: "Input is not a registrable domain",
  bootstrap_error: "Could not load the domain lookup server directory",
};

export function getDomainMetadata(domain: string, rdapKey?: string): DomainMetadata {
  return getDomainMetadataFromParsed(parseDomain(domain), rdapKey);
}

function getDomainMetadataFromParsed(parsed: ParsedDomain, rdapKey?: string): DomainMetadata {
  return {
    tld: parsed.tld,
    rdapKey,
    publicSuffix: parsed.publicSuffix,
    registrableDomain: parsed.registrableDomain,
  };
}

export function getDomainInputError(domain: string): string | null {
  if (!isValidDomain(domain)) return "Invalid domain";
  const parsed = parseDomain(domain);
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
  const parsed = parseDomain(result.domain);
  const metadata = getDomainMetadataFromParsed(parsed, rdapKey);
  const policy = getAvailabilityPolicy({ ...result, ...metadata });
  const reason = parsed.isPrivate
    ? [PRIVATE_SUFFIX_REASON, policy.reason].filter(Boolean).join("; ")
    : policy.reason;

  return {
    ...result,
    ...metadata,
    confidence: result.confidence ?? policy.confidence,
    reason: result.reason ?? (result.terminationReason ? TERMINATION_MESSAGES[result.terminationReason] : reason),
  };
}

export function enrichDomainDetail(detail: DomainDetail, rdapKey?: string): DomainDetail {
  const enriched = enrichDomainResult({
    domain: detail.domain,
    tld: parseDomain(detail.domain).tld,
    status: detail.status,
    method: detail.method,
    responseTime: detail.responseTime,
    error: detail.error,
    terminationReason: detail.terminationReason,
  }, rdapKey);

  return {
    ...detail,
    rdapKey: enriched.rdapKey,
    publicSuffix: enriched.publicSuffix,
    registrableDomain: enriched.registrableDomain,
    confidence: enriched.confidence,
    reason: enriched.reason,
  };
}
