import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkDomains, checkFullDomains, checkSuggestionMatrix } from "../checker/checker.ts";
import { pLimit } from "../checker/limiter.ts";
import { DEFAULT_PREFIXES, DEFAULT_SUFFIXES, DEFAULT_TLDS, EXTENDED_TLDS } from "../checker/types.ts";
import type { DomainResult } from "../checker/types.ts";
import { openBrowser } from "../registrar/browser.ts";
import { type Registrar, REGISTRAR_URLS, buildURL } from "../registrar/urls.ts";
import { isValidDomainLabel, sanitizeDomain } from "../utils/validate.ts";
import { VERSION } from "../version.ts";

export const MCP_INSTRUCTIONS = `temper is a domain availability search tool.

TOOL ROUTING RULES:
- Bare names such as "lockway", "flume", or AI-generated name candidates must use search_domain or search_names.
- Always check the default 30 TLDs first for bare names. Treat .com as the first result to interpret.
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
   - .com: Universal trust, always check first (YC top 20 all own .com)
   - .io: Tech startups, developer tools
   - .dev: Developer-focused products
   - .ai: AI/ML products
   - .app: Web/mobile applications
   - Avoid: .top, .xin (high spam association)

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
  "Check one bare name across TLDs. Use this for names without a TLD, e.g. 'lockway'. Default 30 TLDs first; 59 with extended=true.";

export const SEARCH_NAMES_DESCRIPTION =
  "Check up to 8 bare name candidates across TLDs. Use this for AI-generated names before considering exact domains. Default 30 TLDs first; 59 with extended=true.";

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
  const totalTime = Math.max(...results.map((r) => r.responseTime));

  lines.push(
    `\nSummary: ${available} available, ${taken} taken${other > 0 ? `, ${other} other` : ""} (${results.length} checked in ${(totalTime / 1000).toFixed(1)}s)`,
  );

  return lines.join("\n");
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
    `\nSummary: ${available} available, ${taken} taken${needReview > 0 ? `, ${needReview} to review` : ""} (${requestedDomains.length} checked)`,
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
    if (name.includes(".")) {
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

export function findBareDomainInputs(domains: readonly string[]): string[] {
  return domains
    .map((domain) => sanitizeDomain(domain))
    .filter((domain) => domain.length > 0 && !domain.includes("."));
}

export function formatBareDomainInputError(bareDomains: readonly string[]): string {
  const names = bareDomains.map((domain) => `"${domain}"`).join(", ");
  return `Error: ${names} ${bareDomains.length === 1 ? "is" : "are"} bare domain ${bareDomains.length === 1 ? "name" : "names"}. Use search_domain for one bare name or search_names for multiple bare names. check_domain_availability only accepts full domains explicitly provided by the user.`;
}

server.registerTool("search_domain", {
  description: SEARCH_DOMAIN_DESCRIPTION,
  inputSchema: {
    name: z.string().describe("Domain name without TLD, e.g. 'localhoston'"),
    extended: z.boolean().optional().describe("Check 59 TLDs instead of 30"),
  },
}, async ({ name, extended }) => {
  try {
    const normalized = normalizeSearchDomainInput(name);
    if (normalized.error || !normalized.name) {
      return {
        content: [{ type: "text" as const, text: `Error: ${normalized.error ?? "Invalid bare domain name."}` }],
        isError: true,
      };
    }

    const tlds = extended ? EXTENDED_TLDS : DEFAULT_TLDS;
    const results: DomainResult[] = [];
    for await (const result of checkDomains(normalized.name, tlds)) {
      results.push(result);
    }
    const text = formatResults(normalized.name, results, tlds);
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

server.registerTool("search_names", {
  description: SEARCH_NAMES_DESCRIPTION,
  inputSchema: {
    names: z
      .array(z.string())
      .min(1)
      .max(8)
      .describe("Bare domain names without TLDs, e.g. ['lockway', 'hatchway']. Do not include .com or any other TLD."),
    extended: z.boolean().optional().describe("Check 59 TLDs instead of the default 30"),
  },
}, async ({ names, extended }) => {
  try {
    const normalized = normalizeBareNames(names);
    if (normalized.errors.length > 0) {
      return {
        content: [{ type: "text" as const, text: `Error:\n${normalized.errors.map((error) => `- ${error}`).join("\n")}` }],
        isError: true,
      };
    }

    const tlds = extended ? EXTENDED_TLDS : DEFAULT_TLDS;
    const nameLimit = pLimit(2);
    const groups = await Promise.all(
      normalized.names.map((name) =>
        nameLimit(async () => {
          const results: DomainResult[] = [];
          for await (const result of checkDomains(name, tlds, { concurrency: 10, timeoutMs: 5000 })) {
            results.push(result);
          }
          return { name, results };
        }),
      ),
    );

    return { content: [{ type: "text" as const, text: formatSearchNamesResults(groups, tlds) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

server.registerTool("open_registrar", {
  description: "Open a domain purchase page in the default browser. Choose from cloudflare, porkbun, namecheap, or vercel.",
  inputSchema: {
    domain: z.string().describe("Full domain name, e.g. 'localhoston.app'"),
    registrar: z
      .enum(Object.keys(REGISTRAR_URLS) as [string, ...string[]])
      .describe("Registrar to open purchase page"),
  },
}, async ({ domain, registrar }) => {
  try {
    const url = buildURL(registrar as Registrar, domain);
    openBrowser(url);
    return {
      content: [{ type: "text" as const, text: `Opened ${registrar} for ${domain}: ${url}` }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

const SUGGEST_TLDS = ["com", "dev", "io", "app", "ai"];

server.registerTool("suggest_domain", {
  description: "Generate 15 name combinations (prefixes: get/use/try/my/go/join, suffixes: app/labs/hq/ly/dev/hub/run/kit) and check availability across .com/.dev/.io/.app/.ai using RDAP/WHOIS.",
  inputSchema: { name: z.string().describe("Base name, e.g. 'localhoston'") },
}, async ({ name }) => {
  try {
    const combinations = [name];
    for (const p of DEFAULT_PREFIXES) combinations.push(`${p}${name}`);
    for (const s of DEFAULT_SUFFIXES) combinations.push(`${name}${s}`);

    const groups = await checkSuggestionMatrix(combinations, SUGGEST_TLDS, {
      concurrency: 10,
      timeoutMs: 8000,
    });

    return { content: [{ type: "text" as const, text: formatSuggestDomainResults(groups, SUGGEST_TLDS) }] };
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
      .describe("List of full domain names explicitly provided by the user, e.g. ['localhoston.com', 'getlocalhoston.dev']. Do not append or infer TLDs."),
  },
}, async ({ domains }) => {
  try {
    const bareDomains = findBareDomainInputs(domains);
    if (bareDomains.length > 0) {
      return {
        content: [{ type: "text" as const, text: formatBareDomainInputError(bareDomains) }],
        isError: true,
      };
    }

    const results: DomainResult[] = [];
    for await (const result of checkFullDomains(domains, { concurrency: 30, timeoutMs: 5000 })) {
      results.push(result);
    }

    return { content: [{ type: "text" as const, text: formatFullDomainResults(domains, results) }] };
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
}, async ({ domain }) => {
  try {
    const { domainDetail } = await import("../checker/detail.ts");
    const detail = await domainDetail(domain, { timeoutMs: 10000 });

    const lines: string[] = [`WHOIS/RDAP info for ${domain}:\n`];
    lines.push(`Status: ${detail.status} (via ${detail.method}, ${detail.responseTime}ms)`);

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
      lines.push(`\nThis domain is available for registration!`);
    }

    if (detail.error) {
      lines.push(`\nError: ${detail.error}`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
