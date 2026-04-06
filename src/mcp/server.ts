import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkDomains } from "../checker/checker";
import type { DomainResult } from "../checker/types";
import { openBrowser } from "../registrar/browser";
import { type Registrar, buildURL } from "../registrar/urls";

const server = new McpServer({
  name: "temper",
  version: "0.1.0",
});

function formatResults(name: string, results: DomainResult[]): string {
  const lines: string[] = [`Domain availability for "${name}":\n`];

  for (const r of results) {
    const icon = r.status === "available" ? "✓" : r.status === "taken" ? "✗" : "⚠";
    const method = r.method === "whois" ? "  (whois)" : "";
    lines.push(
      `${icon} ${r.domain.padEnd(22)} ${r.status.padEnd(14)} ${String(r.responseTime).padStart(4)}ms${method}`,
    );
  }

  const available = results.filter((r) => r.status === "available").length;
  const taken = results.filter((r) => r.status === "taken").length;
  const other = results.length - available - taken;
  const totalTime = Math.max(...results.map((r) => r.responseTime));

  lines.push(
    `\nSummary: ${available} available, ${taken} taken${other > 0 ? `, ${other} other` : ""} (${results.length} checked in ${(totalTime / 1000).toFixed(1)}s)`,
  );

  return lines.join("\n");
}

server.tool(
  "search_domain",
  "Check domain availability across 30 TLDs. Input a name without TLD (e.g. 'keycove') and get availability for .com, .io, .app, .dev, etc.",
  { name: z.string().describe("Domain name without TLD, e.g. 'keycove'") },
  async ({ name }) => {
    const results: DomainResult[] = [];
    for await (const result of checkDomains(name)) {
      results.push(result);
    }
    const text = formatResults(name, results);
    return { content: [{ type: "text" as const, text }] };
  },
);

server.tool(
  "open_registrar",
  "Open a domain purchase page in the default browser. Choose from cloudflare, porkbun, namecheap, or vercel.",
  {
    domain: z.string().describe("Full domain name, e.g. 'keycove.app'"),
    registrar: z
      .enum(["cloudflare", "porkbun", "namecheap", "vercel"])
      .describe("Registrar to open purchase page"),
  },
  async ({ domain, registrar }) => {
    const url = buildURL(registrar as Registrar, domain);
    openBrowser(url);
    return {
      content: [{ type: "text" as const, text: `Opened ${registrar} for ${domain}: ${url}` }],
    };
  },
);

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
