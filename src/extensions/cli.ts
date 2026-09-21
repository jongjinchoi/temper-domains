import { browseExtensions, categoryOverview, listCategories } from "./catalog.ts";
import type { Facet } from "./types.ts";

interface Options { categories?: true | string; category?: string; purpose?: string; region?: string; query?: string; cursor?: string; limit?: string; format?: string }
export function splitFilter(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(",").map(s => s.trim());
  if (parts.some(s => !s)) throw new Error("Classification filters must not contain empty values");
  return [...new Set(parts)];
}

export function extensionCommand(opts: Options): string {
  if (opts.format && !["text", "json"].includes(opts.format)) throw new Error("Use --format text or json");
  if (opts.categories !== undefined) {
    if ([opts.category, opts.purpose, opts.region, opts.query, opts.cursor, opts.limit].some(v => v !== undefined)) throw new Error("--categories cannot be combined with extension filters or paging options");
    const result = opts.categories === true ? categoryOverview() : listCategories(opts.categories as Facet);
    if (opts.format === "json") return JSON.stringify(result, null, 2);
    const lines = [`Extension classifications (as of ${result.checkedAt.slice(0, 10)})`, result.notice, ""];
    if ("facets" in result) {
      for (const f of result.facets) lines.push(`${f.name}: ${f.categoryCount} classifications, ${f.extensionCount} extensions`, `  ${f.description}`, `  ${f.command}`);
    } else {
      for (const c of result.categories) lines.push(`${c.id.padEnd(26)} ${c.name} / ${c.nameKo} (${c.count})`, `  ${c.description}`);
      const option = result.facet === "industry" ? "category" : result.facet;
      lines.push(`\nNext: temper extensions --${option} <id>`);
    }
    lines.push(`\n${result.total} supported extensions; ${result.classified} classified by industry/purpose, ${result.unclassified} unclassified. Memberships can overlap.`);
    return lines.join("\n");
  }
  const page = browseExtensions({ industries: splitFilter(opts.category), purposes: splitFilter(opts.purpose), regions: splitFilter(opts.region), query: opts.query, cursor: opts.cursor, limit: opts.limit === undefined ? undefined : Number(opts.limit) });
  if (opts.format === "json") return JSON.stringify(page, null, 2);
  const lines = [`Extensions: ${page.matched} matches / ${page.total} total (as of ${page.checkedAt.slice(0, 10)})`, page.notice, ""];
  for (const e of page.items) {
    lines.push(`.${e.displaySuffix}${e.displaySuffix !== e.suffix ? ` (${e.suffix})` : ""} — boundary: ${e.boundaryState}; lookup route: ${e.lookupSupport}`);
    if (!e.assignments.some(a => a.facet !== "region")) lines.push("  Industry / purpose: unclassified");
    for (const a of e.assignments) lines.push(`  ${a.facet}: ${a.id} — ${a.reason}`, `    ${a.evidenceType}; ${a.checkedAt}; ${a.source}`);
    for (const offer of e.offers ?? []) lines.push(`  Offered by ${offer.provider}; ${offer.checkedAt}; ${offer.source}`);
    lines.push(`  Boundary sources: ${e.provenance.join(" ")}`);
  }
  if (page.nextCursor) lines.push(`\nMore results: repeat the same filters with --cursor ${page.nextCursor}`);
  lines.push("\nSearch chosen extensions: temper search <name> --tlds <suffix,suffix>");
  return lines.join("\n");
}
