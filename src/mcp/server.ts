import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkDomains, checkFullDomains, checkSuggestionMatrix } from "../checker/checker.ts";
import { summarizeResults } from "../checker/stream.ts";
import { getDomainInputError } from "../checker/policy.ts";
import { DEFAULT_PREFIXES, DEFAULT_SUFFIXES, DEFAULT_TLDS, EXTENDED_TLDS } from "../checker/types.ts";
import type { CheckSummary, DomainDetail, DomainResult } from "../checker/types.ts";
import { openBrowser } from "../registrar/browser.ts";
import { type Registrar, REGISTRAR_URLS, buildURL } from "../registrar/urls.ts";
import { isValidDomainLabel, sanitizeDomain } from "../utils/validate.ts";
import { VERSION } from "../version.ts";
import { browseExtensions, categoryOverview, listCategories, catalogStats, catalogVersion } from "../extensions/catalog.ts";
import { assertCandidateLimit, resolveExplicitSelection, validateSearchCombinations } from "../extensions/selection.ts";
import { formatSelectedResults } from "./search-format.ts";

export const MCP_INSTRUCTIONS = `temper is a domain availability search tool.

TOOL ROUTING RULES:
- Use list_supported_tlds when the user asks which domain extensions are supported or what the default and extended lists contain. This lists the search catalog without checking domain availability.
- Bare names such as "lockway", "flume", or AI-generated name candidates must use search_domain or search_names.
- For bare names without a requested extension or classification, check the default 30 TLDs first. Treat .com as the first result to interpret in that mode.
- When extensions are explicitly selected, pass only those suffixes in tlds to search_domain or search_names. Do not add default TLDs. Do not combine tlds and extended.
- For industry, purpose or region discovery, use list_supported_tlds with view=categories (facet optional), then view=extensions and the relevant filters. Explain classification inclusion evidence, then search the user's chosen suffixes. Do not turn contextual geography into an unrequested strict filter.
- Use extended=true only after the default TLD results are not enough or the user asks for a wider search.
- Use check_domain_availability only for full domains explicitly provided by the user, such as "lockway.com".
- Do not infer, append, or choose TLDs for the user and then pass those invented domains to check_domain_availability.

When a user asks for domain name suggestions without a specific name:

1. GENERATE NAMES FIRST using these rules:
   - 4-8 characters, 1-3 syllables ideal
   - Must be pronounceable and easy to spell over the phone
   - No hyphens or numbers
   - Brandable and unique — avoid generic industry keywords
   - Consider these naming types: descriptive (PayPal), invented (Spotify), real-word reuse (Stripe, Slack), or metaphor (Amazon)

2. CHECK AVAILABILITY using search_names for multiple candidates, or search_domain for one candidate

3. SUGGEST ALTERNATIVES using suggest_domain for the best candidates (adds prefixes like get/try/use and suffixes like app/hub/dev)

4. TLD SELECTION GUIDE:
   - Use the shared extension catalog for classification reasons and sources.
   - Classification is not evidence of popularity, price, registration eligibility, SEO or investment value.
   - Missing classification does not prevent explicit suffix selection. Do not force a category onto an unclassified extension. Review records state the inspected sources and any missing evidence.
   - Known lookup routes and observed server responses are separate. Inspect verification.state and its dated observation; needs-recheck or not-checked is not a confirmed failure. Even response-confirmed is not a purchase guarantee.

5. FINAL RECOMMENDATION should include:
   - Top pick with reasoning
   - 2-3 alternatives
   - Note if .com is taken but alternatives exist

6. ADDITIONAL CHECKS — flag these in your response:
   - International meaning: If a suggested name has negative connotations in other languages, warn the user
   - Trademark risk: If a name is very similar to a well-known brand, note the potential conflict
   - Google the top picks to check if the name is already used by another product or company
   - Remind user to verify: social media handle (@username) availability on major platforms`;

export const SEARCH_DOMAIN_DESCRIPTION =
  "Check one bare name across TLDs. Use this for names without a TLD, e.g. 'lockway'. Default 30 TLDs first; 60 with extended=true. Set tlds to search only chosen suffixes, including co.uk. Cannot combine tlds with extended; max 480 selected domain candidates.";

export const SEARCH_NAMES_DESCRIPTION =
  "Check up to 8 bare name candidates across TLDs. Use this for AI-generated names before considering exact domains. Default 30 TLDs first; 60 with extended=true. Set tlds to search only chosen suffixes, including co.uk. Cannot combine tlds with extended; max 480 names × suffixes.";

export const CHECK_DOMAIN_AVAILABILITY_DESCRIPTION =
  "Check availability for full domain names explicitly provided by the user using RDAP/WHOIS. Max 100 domains. Do not infer, append, or choose TLDs; use search_domain or search_names for bare names.";

const server = new McpServer(
  { name: "temper", version: VERSION },
  { instructions: MCP_INSTRUCTIONS },
);

function formatResultLine(r: DomainResult): string {
  const icon = getResultIcon(r);
  const method = r.method === "whois" ? "  (whois)" : "";
  const error = r.error ? `  ${r.error}` : "";
  const confidence = formatConfidence(r);
  return `${icon} ${r.domain.padEnd(22)} ${r.status.padEnd(14)} ${String(r.responseTime).padStart(4)}ms${method}${confidence}${error}`;
}

export function formatResults(
  name: string,
  results: DomainResult[],
  tlds: readonly string[] = DEFAULT_TLDS,
  summary?: CheckSummary,
): string {
  const lines: string[] = [`Domain availability for "${name}":\n`];
  const byTld = new Map(results.map((r) => [r.tld, r]));
  const orderedResults = tlds
    .map((tld) => byTld.get(tld))
    .filter((r): r is DomainResult => !!r);
  const orderedTlds = new Set(orderedResults.map((r) => r.tld));
  const unorderedResults = results.filter((r) => !orderedTlds.has(r.tld));
  const displayResults = [...orderedResults, ...unorderedResults];

  const defaultTldSet = new Set<string>(DEFAULT_TLDS);
  const hasExtendedTlds = tlds.some((tld) => !defaultTldSet.has(tld));

  if (hasExtendedTlds) {
    lines.push("Default TLDs:");
  }

  for (const r of displayResults.filter((r) => defaultTldSet.has(r.tld))) {
    lines.push(formatResultLine(r));
  }

  const extendedResults = displayResults.filter((r) => !defaultTldSet.has(r.tld));
  if (extendedResults.length > 0) {
    lines.push("\nExtended TLDs:");
    for (const r of extendedResults) {
      lines.push(formatResultLine(r));
    }
  }

  const available = results.filter(isAvailableResult).length;
  const taken = results.filter((r) => r.status === "taken").length;
  const other = results.length - available - taken;

  lines.push(
    `\nSummary: ${available} available, ${taken} taken${other > 0 ? `, ${other} other` : ""} (${results.length} results)`,
  );

  if (summary) lines.push(formatCoverage(summary));
  return lines.join("\n");
}

function formatCoverage(summary: CheckSummary): string {
  return `Coverage: ${summary.requested} requested, ${summary.attempted} attempted, ${summary.answered} answered, ${summary.unresolved} unresolved in ${(summary.elapsedMs / 1000).toFixed(1)}s`;
}

function getStatusIcon(status: DomainResult["status"]): string {
  if (status === "available") return "✓";
  if (status === "taken") return "✗";
  return "⚠";
}

function getResultIcon(result: DomainResult): string {
  if (result.status === "available" && result.confidence === "low") return "⚠";
  return getStatusIcon(result.status);
}

function formatConfidence(result: DomainResult): string {
  if (!result.confidence || result.confidence === "high") return "";
  const reason = result.reason ? `; ${result.reason}` : "";
  return `  ${result.confidence} confidence${reason}`;
}

function isAvailableResult(result: DomainResult): boolean {
  return result.status === "available" && result.confidence !== "low";
}

function orderResultsByInput(
  requestedDomains: readonly string[],
  results: readonly DomainResult[],
): DomainResult[] {
  const remainingByDomain = new Map<string, DomainResult[]>();

  for (const result of results) {
    const bucket = remainingByDomain.get(result.domain) ?? [];
    bucket.push(result);
    remainingByDomain.set(result.domain, bucket);
  }

  const ordered: DomainResult[] = [];
  for (const domain of requestedDomains) {
    const key = sanitizeDomain(domain).toLowerCase();
    const bucket = remainingByDomain.get(key);
    const result = bucket?.shift();
    if (result) ordered.push(result);
    if (bucket?.length === 0) remainingByDomain.delete(key);
  }

  for (const bucket of remainingByDomain.values()) {
    ordered.push(...bucket);
  }

  return ordered;
}

export function formatFullDomainResults(
  requestedDomains: readonly string[],
  results: readonly DomainResult[],
): string {
  const lines = ["Domain availability check:\n"];
  const orderedResults = orderResultsByInput(requestedDomains, results);

  for (const result of orderedResults) {
    const icon = getResultIcon(result);
    const error = result.error ? `  ${result.error}` : "";
    const confidence = formatConfidence(result);
    lines.push(
      `${icon} ${result.domain.padEnd(30)} ${result.status.padEnd(14)} ${result.method.padEnd(5)} ${String(result.responseTime).padStart(4)}ms${confidence}${error}`,
    );
  }

  const available = results.filter(isAvailableResult).length;
  const taken = results.filter((r) => r.status === "taken").length;
  const needReview = results.length - available - taken;

  lines.push(
    `\nSummary: ${available} available, ${taken} taken${needReview > 0 ? `, ${needReview} to review` : ""} (${requestedDomains.length} requested)`,
  );

  return lines.join("\n");
}

export interface NameSearchResultGroup {
  name: string;
  results: DomainResult[];
}

function formatCompactResult(result: DomainResult): string {
  const icon = getResultIcon(result);
  const error = result.error ? `  ${result.error}` : "";
  const confidence = formatConfidence(result);
  return `  ${icon} .${result.tld.padEnd(8)} ${result.status.padEnd(14)} ${String(result.responseTime).padStart(4)}ms${confidence}${error}`;
}

function formatDomainList(results: readonly DomainResult[]): string {
  return results.map((result) => result.domain).join(", ");
}

function formatSuggestionMatrixCell(result: DomainResult | undefined): string {
  if (!result) return "?".padEnd(8);
  if (isAvailableResult(result)) return "✓".padEnd(8);
  if (result.status === "taken") return "✗".padEnd(8);
  return "⚠".padEnd(8);
}

export function formatSuggestDomainResults(
  groups: readonly NameSearchResultGroup[],
  tlds: readonly string[],
): string {
  const header = `${"name".padEnd(20)} ${tlds.map((tld) => `.${tld}`.padEnd(8)).join("")}`;
  const lines = [header];
  const reviewResults: DomainResult[] = [];

  for (const group of groups) {
    const byTld = new Map(group.results.map((result) => [result.tld, result]));
    const cols = tlds.map((tld) => {
      const result = byTld.get(tld);
      if (result && !isAvailableResult(result) && result.status !== "taken") {
        reviewResults.push(result);
      }
      return formatSuggestionMatrixCell(result);
    }).join("");
    lines.push(`${group.name.padEnd(20)} ${cols}`);
  }

  const allResults = groups.flatMap((group) => group.results);
  const available = allResults.filter(isAvailableResult).length;
  const taken = allResults.filter((result) => result.status === "taken").length;
  const review = allResults.length - available - taken;
  lines.push(`\n${available}/${allResults.length} available, ${taken} taken${review > 0 ? `, ${review} to review` : ""}`);

  if (reviewResults.length > 0) {
    lines.push("\nReview:");
    for (const result of reviewResults) {
      const error = result.error ? `  ${result.error}` : "";
      const confidence = formatConfidence(result);
      lines.push(`⚠ ${result.domain} ${result.status}${confidence}${error}`);
    }
  }

  return lines.join("\n");
}

export function formatSearchNamesResults(
  groups: readonly NameSearchResultGroup[],
  tlds: readonly string[] = DEFAULT_TLDS,
): string {
  const defaultTldSet = new Set<string>(DEFAULT_TLDS);
  const hasExtendedTlds = tlds.some((tld) => !defaultTldSet.has(tld));
  const mode = hasExtendedTlds ? `extended ${tlds.length} TLDs` : `default ${tlds.length} TLDs`;
  const lines = [`Domain search for ${groups.length} names (${mode}):`];

  for (const group of groups) {
    const byTld = new Map(group.results.map((result) => [result.tld, result]));
    const orderedResults = tlds
      .map((tld) => byTld.get(tld))
      .filter((result): result is DomainResult => !!result);
    const available = orderedResults.filter(isAvailableResult);
    const taken = orderedResults.filter((result) => result.status === "taken");
    const review = orderedResults.length - available.length - taken.length;
    const comResult = byTld.get("com");
    const availableDefaults = available.filter((result) => defaultTldSet.has(result.tld)).slice(0, 5);
    const availableExtended = available.filter((result) => !defaultTldSet.has(result.tld)).slice(0, 5);

    lines.push(`\n${group.name}`);
    if (comResult) {
      lines.push(formatCompactResult(comResult));
    }

    if (availableDefaults.length > 0) {
      lines.push(`  Available default options: ${formatDomainList(availableDefaults)}`);
    } else {
      lines.push("  Available default options: none found");
    }

    if (availableExtended.length > 0) {
      lines.push(`  Available extended options: ${formatDomainList(availableExtended)}`);
    }

    lines.push(
      `  Summary: ${available.length} available, ${taken.length} taken${review > 0 ? `, ${review} to review` : ""}`,
    );
  }

  if (!hasExtendedTlds) {
    lines.push("\nNext: use search_names with extended=true if default TLDs are not enough.");
  }

  return lines.join("\n");
}

function normalizeBareNames(names: readonly string[]): { names: string[]; errors: string[] } {
  const normalized: string[] = [];
  const errors: string[] = [];

  for (const rawName of names) {
    const name = sanitizeDomain(rawName).toLowerCase();
    if (name.includes(".") && !getDomainInputError(name)) {
      errors.push(`${rawName} is a full domain. Use check_domain_availability for explicit full domains.`);
    } else if (!isValidDomainLabel(name)) {
      errors.push(`${rawName} is not a valid bare domain name.`);
    } else {
      normalized.push(name);
    }
  }

  return { names: [...new Set(normalized)], errors };
}

export function normalizeSearchDomainInput(name: string): { name?: string; error?: string } {
  const normalized = normalizeBareNames([name]);
  if (normalized.errors.length > 0) return { error: normalized.errors[0] };
  return { name: normalized.names[0] };
}

export function normalizeFullDomainInput(domain: string): { domain?: string; error?: string } {
  const normalized = sanitizeDomain(domain).toLowerCase();
  const error = getDomainInputError(normalized);
  if (error) return { error: `${domain} is not a valid registrable domain: ${error}.` };
  return { domain: normalized };
}

export function formatDomainDetail(detail: DomainDetail): string {
  const lines: string[] = [`WHOIS/RDAP info for ${detail.domain}:\n`];
  lines.push(`Status: ${detail.status} (via ${detail.method}, ${detail.responseTime}ms)`);

  if (detail.confidence && detail.confidence !== "high") {
    lines.push(`Confidence: ${detail.confidence}`);
  }

  if (detail.status === "taken") {
    if (detail.registrar) lines.push(`Registrar: ${detail.registrar}`);
    if (detail.registrant) lines.push(`Registrant: ${detail.registrant}`);
    if (detail.createdDate) lines.push(`Created: ${detail.createdDate}`);
    if (detail.updatedDate) lines.push(`Updated: ${detail.updatedDate}`);
    if (detail.expiryDate) lines.push(`Expires: ${detail.expiryDate}`);
    if (detail.dnssec != null) lines.push(`DNSSEC: ${detail.dnssec ? "signed" : "unsigned"}`);
    if (detail.nameServers?.length) lines.push(`Name Servers: ${detail.nameServers.join(", ")}`);
    if (detail.statusCodes?.length) lines.push(`Status Codes: ${detail.statusCodes.join(", ")}`);
  }

  if (detail.status === "available") {
    lines.push("\nNo RDAP/WHOIS registration record was found.");
  }

  if (detail.reason && detail.confidence !== "high") {
    lines.push(`Review: ${detail.reason}`);
  }

  if (detail.error) {
    lines.push(`\nError: ${detail.error}`);
  }

  return lines.join("\n");
}

export function findBareDomainInputs(domains: readonly string[]): string[] {
  return domains
    .map((domain) => sanitizeDomain(domain))
    .filter((domain) => domain.length > 0 && !domain.includes("."));
}

export function formatBareDomainInputError(bareDomains: readonly string[]): string {
  const names = bareDomains.map((domain) => `"${domain}"`).join(", ");
  return `Error: ${names} ${bareDomains.length === 1 ? "is" : "are"} bare domain ${bareDomains.length === 1 ? "name" : "names"}. Use search_domain for one bare name or search_names for multiple bare names. check_domain_availability only accepts full domains explicitly provided by the user.`;
}

const discoverySchema = z.strictObject({
  view: z.enum(["presets", "categories", "extensions"]).optional(),
  facet: z.enum(["industry", "purpose", "region"]).optional(),
  query: z.string().optional(),
  industries: z.array(z.string()).min(1).optional(),
  purposes: z.array(z.string()).min(1).optional(),
  regions: z.array(z.string()).min(1).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

server.registerTool("list_supported_tlds", {
  description: "Discover extensions offline. No arguments returns the default/additional/extended search bundles. view=categories returns facet navigation, or classifications with facet=industry|purpose|region. view=extensions lists supported extensions with classification reviews, offering evidence and dated lookup verification, filtered by query/industries/purposes/regions, with cursor paging (default 50, max 100). Unclassified extensions remain selectable. Listing does not query domains. Lookup results may differ from final purchase availability.",
  inputSchema: discoverySchema,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
}, (args) => {
  try {
    const { view = "presets", facet, ...filters } = args;
    const hasFilters = Object.values(filters).some(value => value !== undefined);
    let catalog: Record<string, unknown>;
    if (view === "presets") {
      if (facet !== undefined || hasFilters) throw new Error("Bundle listing does not accept facet, filters or paging; select categories or extensions view");
      const defaults = new Set<string>(DEFAULT_TLDS);
      const additional = EXTENDED_TLDS.filter(tld => !defaults.has(tld));
      catalog = {
        default: { count: DEFAULT_TLDS.length, tlds: [...DEFAULT_TLDS] },
        additional: { count: additional.length, tlds: additional },
        extended: { count: EXTENDED_TLDS.length, tlds: [...EXTENDED_TLDS] },
        discovery: { total: catalogStats().total, catalogVersion, view: "extensions", defaultPageSize: 50, maxPageSize: 100 },
        usage: "For search_domain and search_names, omit extended or set extended=false for the default list; set extended=true for the full extended list, which includes the default list. These are built-in search bundles, not a list of all existing or registerable domain extensions. Domain availability is not checked here. Use view=categories or view=extensions for discovery beyond these bundles; pass tlds to search only selected suffixes. Never combine tlds with extended.",
      };
    } else if (view === "categories") {
      if (hasFilters) throw new Error("Category navigation accepts only facet; use view=extensions for filters or paging");
      catalog = facet ? listCategories(facet) : categoryOverview();
    } else {
      if (facet !== undefined) throw new Error("facet is only valid with view=categories");
      catalog = browseExtensions(filters);
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(catalog, null, 2) }], structuredContent: catalog };
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

server.registerTool("search_domain", {
  description: SEARCH_DOMAIN_DESCRIPTION,
  inputSchema: z.strictObject({
    name: z.string().describe("Domain name without TLD, e.g. 'gethalden'"),
    extended: z.boolean().optional().describe("Check 60 TLDs instead of 30"),
    tlds: z.array(z.string()).min(1).optional().describe("Only these suffixes; e.g. ['design', 'co.uk']. Cannot combine with extended."),
  }),
}, async ({ name, extended, tlds: selected }, extra) => {
  try {
    const normalized = normalizeSearchDomainInput(name);
    if (normalized.error || !normalized.name) {
      return {
        content: [{ type: "text" as const, text: `Error: ${normalized.error ?? "Invalid bare domain name."}` }],
        isError: true,
      };
    }

    if (selected !== undefined && extended !== undefined) throw new Error("tlds and extended cannot be combined");
    const tlds = selected !== undefined ? resolveExplicitSelection(selected) : extended ? EXTENDED_TLDS : DEFAULT_TLDS;
    if (selected !== undefined) {
      assertCandidateLimit(1, tlds.length);
      validateSearchCombinations([normalized.name], tlds);
    }
    let summary: CheckSummary | undefined;
    const results: DomainResult[] = [];
    for await (const result of checkDomains(normalized.name, tlds, { signal: extra.signal, onSummary: value => { summary = value; } })) {
      results.push(result);
    }
    const text = selected !== undefined ? formatSelectedResults([normalized.name], tlds, results, summary) : formatResults(normalized.name, results, tlds, summary);
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

server.registerTool("search_names", {
  description: SEARCH_NAMES_DESCRIPTION,
  inputSchema: z.strictObject({
    names: z
      .array(z.string())
      .min(1)
      .max(8)
      .describe("Bare domain names without TLDs, e.g. ['lockway', 'hatchway']. Do not include .com or any other TLD."),
    extended: z.boolean().optional().describe("Check 60 TLDs instead of the default 30"),
    tlds: z.array(z.string()).min(1).optional().describe("Only these suffixes; maximum 480 names × suffixes. Cannot combine with extended."),
  }),
}, async ({ names, extended, tlds: selected }, extra) => {
  try {
    const normalized = normalizeBareNames(names);
    if (normalized.errors.length > 0) {
      return {
        content: [{ type: "text" as const, text: `Error:\n${normalized.errors.map((error) => `- ${error}`).join("\n")}` }],
        isError: true,
      };
    }

    if (selected !== undefined && extended !== undefined) throw new Error("tlds and extended cannot be combined");
    const tlds = selected !== undefined ? resolveExplicitSelection(selected) : extended ? EXTENDED_TLDS : DEFAULT_TLDS;
    if (selected !== undefined) {
      assertCandidateLimit(normalized.names.length, tlds.length);
      validateSearchCombinations(normalized.names, tlds);
    }
    const startedAt = performance.now();
    const groups = await checkSuggestionMatrix(normalized.names, tlds, { concurrency: 20, signal: extra.signal });
    const summary = summarizeResults(groups.flatMap(group => group.results), normalized.names.length * tlds.length, performance.now() - startedAt);
    return { content: [{ type: "text" as const, text: selected !== undefined ? formatSelectedResults(normalized.names, tlds, groups.flatMap(group => group.results), summary) : formatSearchNamesResults(groups, tlds) + "\n" + formatCoverage(summary) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

server.registerTool("open_registrar", {
  description: "Open a domain purchase page in the default browser. Choose from cloudflare, porkbun, namecheap, or vercel.",
  inputSchema: {
    domain: z.string().describe("Full domain name, e.g. 'gethalden.app'"),
    registrar: z
      .enum(Object.keys(REGISTRAR_URLS) as [string, ...string[]])
      .describe("Registrar to open purchase page"),
  },
}, async ({ domain, registrar }) => {
  try {
    const normalized = normalizeFullDomainInput(domain);
    if (normalized.error || !normalized.domain) {
      return {
        content: [{ type: "text" as const, text: `Error: ${normalized.error ?? "Invalid domain."}` }],
        isError: true,
      };
    }
    const url = buildURL(registrar as Registrar, normalized.domain);
    openBrowser(url);
    return {
      content: [{ type: "text" as const, text: `Opened ${registrar} for ${normalized.domain}: ${url}` }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

const SUGGEST_TLDS = ["com", "dev", "io", "app", "ai"];

server.registerTool("suggest_domain", {
  description: "Generate 15 name combinations (prefixes: get/use/try/my/go/join, suffixes: app/labs/hq/ly/dev/hub/run/kit) and check availability across .com/.dev/.io/.app/.ai using RDAP/WHOIS.",
  inputSchema: { name: z.string().describe("Base name, e.g. 'gethalden'") },
}, async ({ name }, extra) => {
  try {
    const normalized = normalizeSearchDomainInput(name);
    if (normalized.error || !normalized.name) {
      return {
        content: [{ type: "text" as const, text: `Error: ${normalized.error ?? "Invalid bare domain name."}` }],
        isError: true,
      };
    }
    const combinations = [normalized.name];
    for (const p of DEFAULT_PREFIXES) combinations.push(`${p}${normalized.name}`);
    for (const s of DEFAULT_SUFFIXES) combinations.push(`${normalized.name}${s}`);

    let summary: CheckSummary | undefined;
    const groups = await checkSuggestionMatrix(combinations, SUGGEST_TLDS, {
      concurrency: 10,
      signal: extra.signal,
      onSummary: value => { summary = value; },
    });

    return { content: [{ type: "text" as const, text: formatSuggestDomainResults(groups, SUGGEST_TLDS) + (summary ? "\n" + formatCoverage(summary) : "") }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

server.registerTool("check_domain_availability", {
  description: CHECK_DOMAIN_AVAILABILITY_DESCRIPTION,
  inputSchema: {
    domains: z
      .array(z.string())
      .max(100)
      .describe("List of full domain names explicitly provided by the user, e.g. ['gethalden.com', 'usegethalden.dev']. Do not append or infer TLDs."),
  },
}, async ({ domains }, extra) => {
  try {
    const bareDomains = findBareDomainInputs(domains);
    if (bareDomains.length > 0) {
      return {
        content: [{ type: "text" as const, text: formatBareDomainInputError(bareDomains) }],
        isError: true,
      };
    }

    const results: DomainResult[] = [];
    let summary: CheckSummary | undefined;
    for await (const result of checkFullDomains(domains, { concurrency: 20, signal: extra.signal, onSummary: value => { summary = value; } })) {
      results.push(result);
    }

    return { content: [{ type: "text" as const, text: formatFullDomainResults(domains, results) + (summary ? "\n" + formatCoverage(summary) : "") }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

server.registerTool("whois_domain", {
  description: "Get detailed WHOIS/RDAP information for a domain including registrar, expiry date, nameservers, and status codes.",
  inputSchema: {
    domain: z.string().describe("Full domain name, e.g. 'example.com'"),
  },
}, async ({ domain }, extra) => {
  try {
    const normalized = normalizeFullDomainInput(domain);
    if (normalized.error || !normalized.domain) {
      return {
        content: [{ type: "text" as const, text: `Error: ${normalized.error ?? "Invalid domain."}` }],
        isError: true,
      };
    }
    const { domainDetail } = await import("../checker/detail.ts");
    const detail = await domainDetail(normalized.domain, { timeoutMs: 10000, signal: extra.signal });
    return { content: [{ type: "text" as const, text: formatDomainDetail(detail) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

// SDK 1.30 validates an absent argument object as undefined. Preserve the original
// no-argument discovery call while exposing its new optional fields in tools/list.
class DiscoveryStdioTransport extends StdioServerTransport {
  override async start() {
    const receive = this.onmessage;
    this.onmessage = (message) => {
      if ("method" in message && message.method === "tools/call" && message.params?.name === "list_supported_tlds" && message.params.arguments === undefined) {
        message = { ...message, params: { ...message.params, arguments: {} } };
      }
      receive?.(message);
    };
    await super.start();
  }
}

export async function startMcpServer() {
  const transport = new DiscoveryStdioTransport();
  await server.connect(transport);
}
