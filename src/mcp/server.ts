import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getBootstrap, getRdapUrl } from "../checker/bootstrap.ts";
import { checkDomains } from "../checker/checker.ts";
import { getServerLimit, pLimit } from "../checker/limiter.ts";
import { rdapLookup } from "../checker/rdap.ts";
import type { DomainResult } from "../checker/types.ts";
import { whoisLookup } from "../checker/whois.ts";
import { openBrowser } from "../registrar/browser.ts";
import { type Registrar, buildURL } from "../registrar/urls.ts";

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

server.registerTool("search_domain", {
  description: "Check domain availability across TLDs. Default 30 TLDs, or 64 with extended=true.",
  inputSchema: {
    name: z.string().describe("Domain name without TLD, e.g. 'localhoston'"),
    extended: z.boolean().optional().describe("Check 64 TLDs instead of 30"),
  },
}, async ({ name, extended }) => {
    const { DEFAULT_TLDS, EXTENDED_TLDS } = await import("../checker/types.ts");
    const tlds = extended ? EXTENDED_TLDS : DEFAULT_TLDS;
    const results: DomainResult[] = [];
    for await (const result of checkDomains(name, tlds)) {
      results.push(result);
    }
    const text = formatResults(name, results);
    return { content: [{ type: "text" as const, text }] };
  },
);

server.registerTool("open_registrar", {
  description: "Open a domain purchase page in the default browser. Choose from cloudflare, porkbun, namecheap, or vercel.",
  inputSchema: {
    domain: z.string().describe("Full domain name, e.g. 'localhoston.app'"),
    registrar: z
      .enum(["cloudflare", "porkbun", "namecheap", "vercel"])
      .describe("Registrar to open purchase page"),
  },
}, async ({ domain, registrar }) => {
    const url = buildURL(registrar as Registrar, domain);
    openBrowser(url);
    return {
      content: [{ type: "text" as const, text: `Opened ${registrar} for ${domain}: ${url}` }],
    };
  },
);

const PREFIXES = ["get", "use", "try", "my", "go", "join"];
const SUFFIXES = ["app", "labs", "hq", "ly", "dev", "hub", "run", "kit"];
const SUGGEST_TLDS = ["com", "dev", "io", "app", "ai"];

server.registerTool("suggest_domain", {
  description: "Generate 15 name combinations (prefixes: get/use/try/my/go/join, suffixes: app/labs/hq/ly/dev/hub/run/kit) and check availability across .com/.dev/.io/.app/.ai using DNS.",
  inputSchema: { name: z.string().describe("Base name, e.g. 'localhoston'") },
}, async ({ name }) => {
    const { dnsCheck } = await import("../checker/dns.ts");
    const combinations = [name];
    for (const p of PREFIXES) combinations.push(`${p}${name}`);
    for (const s of SUFFIXES) combinations.push(`${name}${s}`);

    const limit = pLimit(30);
    const resultMap = new Map<string, string>();

    const tasks = combinations.flatMap((n) =>
      SUGGEST_TLDS.map((tld) =>
        limit(async () => {
          const status = await dnsCheck(`${n}.${tld}`);
          resultMap.set(`${n}:${tld}`, status);
        }),
      ),
    );

    await Promise.allSettled(tasks);

    const header = `${"name".padEnd(20)} ${SUGGEST_TLDS.map((t) => `.${t}`.padEnd(8)).join("")}`;
    const lines = [header];

    for (const n of combinations) {
      const cols = SUGGEST_TLDS.map((tld) => {
        const status = resultMap.get(`${n}:${tld}`) ?? "error";
        const icon = status === "available" ? "✓" : "✗";
        return icon.padEnd(8);
      }).join("");
      lines.push(`${n.padEnd(20)} ${cols}`);
    }

    const available = [...resultMap.values()].filter((s) => s === "available").length;
    const total = resultMap.size;
    lines.push(`\n${available}/${total} available`);

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

server.registerTool("check_domain_availability", {
  description: "Check availability for a list of full domain names. Uses DNS fast-check then RDAP verification for accuracy. Max 100 domains.",
  inputSchema: {
    domains: z
      .array(z.string())
      .max(100)
      .describe("List of full domain names, e.g. ['localhoston.com', 'getlocalhoston.dev']"),
  },
}, async ({ domains }) => {
    const { dnsCheck } = await import("../checker/dns.ts");

    await getBootstrap();
    const limit = pLimit(30);

    // Step 1: DNS fast check (no rate limits)
    const dnsResults = new Map<string, string>();
    await Promise.allSettled(
      domains.map((domain) =>
        limit(async () => {
          const status = await dnsCheck(domain);
          dnsResults.set(domain, status);
        }),
      ),
    );

    // Step 2: RDAP verify only DNS "available" results (prevent false positives)
    const needsVerify = domains.filter((d) => dnsResults.get(d) === "available");
    const verifyLimit = pLimit(10);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await Promise.allSettled(
      needsVerify.map((domain) =>
        verifyLimit(async () => {
          const tld = domain.split(".").pop()!;
          const rdapUrl = getRdapUrl(tld);
          if (!rdapUrl) return;
          const r = await rdapLookup(domain, rdapUrl, controller.signal);
          if (r.status === "taken") dnsResults.set(domain, "taken");
        }),
      ),
    );

    clearTimeout(timeout);

    // Format output
    const lines = ["Domain availability check:\n"];
    for (const domain of domains) {
      const status = dnsResults.get(domain) ?? "error";
      const icon = status === "available" ? "✓" : "✗";
      lines.push(`${icon} ${domain.padEnd(30)} ${status}`);
    }

    const available = [...dnsResults.values()].filter((s) => s === "available").length;
    lines.push(`\n${available}/${domains.length} available`);

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
