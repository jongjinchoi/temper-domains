import type { CheckSummary, DomainResult } from "../checker/types.ts";

export function formatSelectedResults(names: readonly string[], suffixes: readonly string[], results: readonly DomainResult[], summary?: CheckSummary): string {
  const lines = [`Selected extensions: ${suffixes.map(s => `.${s}`).join(", ")}`, "Lookup results may differ from final purchase availability.", ""];
  const byDomain = new Map(results.map(r => [r.domain, r]));
  for (const name of names) for (const suffix of suffixes) {
    const domain = `${name}.${suffix}`;
    const r = byDomain.get(domain);
    if (!r) { lines.push(`${domain}  unresolved — no result returned`); continue; }
    lines.push(`${r.domain}  ${r.status}${r.status === "available" && r.confidence === "low" ? " (review required)" : ""}  ${r.method}  ${r.responseTime}ms${r.confidence ? `  ${r.confidence} confidence` : ""}${r.reason ? `; ${r.reason}` : ""}${r.error ? `; ${r.error}` : ""}${r.terminationReason ? `; ${r.terminationReason}` : ""}`);
  }
  if (summary) lines.push(`\nCoverage: ${summary.requested} requested, ${summary.attempted} attempted, ${summary.answered} answered, ${summary.unresolved} unresolved in ${(summary.elapsedMs / 1000).toFixed(1)}s`);
  return lines.join("\n");
}
