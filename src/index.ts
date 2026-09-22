#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, saveConfig } from "./config/config.ts";
import { THEME_NAMES, setTheme } from "./tui/theme.ts";
import { isValidDomain, isValidDomainLabel, sanitizeDomain } from "./utils/validate.ts";
import { VERSION } from "./version.ts";
import { resolveExplicitSelection, resolveCategorySelection, assertCandidateLimit, validateSearchCombinations } from "./extensions/selection.ts";
import { extensionCommand, splitFilter } from "./extensions/cli.ts";
import { maybeUpdate, updateCommand } from "./update/cli.ts";

const DEFAULT_WHOIS_TIMEOUT_SECONDS = 10;

function exitWithError(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function validateLabelOrExit(label: string, argName: string): string {
  const clean = sanitizeDomain(label);
  if (!isValidDomainLabel(clean)) {
    exitWithError(
      `invalid ${argName} '${label}'. Must be 1-63 alphanumeric characters (hyphens allowed except at start/end).`,
    );
  }
  return clean;
}

function validateDomainOrExit(domain: string, argName: string): string {
  const clean = sanitizeDomain(domain);
  if (!isValidDomain(clean)) {
    exitWithError(
      `invalid ${argName} '${domain}'. Expected a full domain like 'example.com'.`,
    );
  }
  return clean;
}

function validateTldsOrExit(rawTlds: string): string[] {
  return resolveExplicitSelection(rawTlds.split(","));
}

function parseTimeoutMsOrExit(value: string, argName: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    exitWithError(`invalid ${argName} '${value}'. Expected a positive number of seconds.`);
  }
  return Math.round(seconds * 1000);
}

const program = new Command();

program
  .name("temper")
  .description("Never leave your terminal to find a domain.")
  .version(VERSION);

// --- search ---
program
  .command("search")
  .argument("<queries...>")
  .option("--tlds <tlds>", "Only these comma-separated extensions (e.g. design,studio,co.uk)")
  .option("--category <ids>", "Search an industry classification (discover with extensions --categories industry)")
  .option("--extended", "Check 60 TLDs instead of 30")
  .option("-a, --only-available", "Show only available domains")
  .option("-f, --format <format>", "Output format (tui, json)", "tui")
  .option("-t, --timeout <seconds>", "Whole-search timeout including bootstrap (default: automatic 5–30s)")
  .description("Search domain availability across TLDs")
  .action(async (queries: string[], opts) => {
    queries = queries.map((q) => validateLabelOrExit(q, "query"));

    const config = await loadConfig();
    setTheme(config.theme);

    // Explicit extensions keep precedence over the extended bundle.
    let tlds: string[] | undefined;
    if (opts.category !== undefined) {
      if (opts.tlds !== undefined || opts.extended !== undefined) throw new Error("--category cannot be combined with --tlds or --extended");
      tlds = resolveCategorySelection({ industries: splitFilter(opts.category) });
      assertCandidateLimit(queries.length, tlds.length);
    } else if (opts.tlds !== undefined) {
      tlds = validateTldsOrExit(opts.tlds);
    } else if (opts.extended) {
      const { EXTENDED_TLDS } = await import("./checker/types.ts");
      tlds = [...EXTENDED_TLDS];
    }
    if (tlds) validateSearchCombinations(queries, tlds);

    const timeoutMs = opts.timeout === undefined ? undefined : parseTimeoutMsOrExit(opts.timeout, "--timeout");

    // JSON output mode — no Ink
    if (opts.format === "json") {
      const { checkDomains } = await import("./checker/checker.ts");
      const allResults = [];
      for (const query of queries) {
        const results = [];
        for await (const r of checkDomains(query, tlds, { timeoutMs })) {
          if (opts.onlyAvailable && r.status !== "available") continue;
          results.push(r);
        }
        allResults.push(...results);
      }
      console.log(JSON.stringify(allResults, null, 2));
      return;
    }

    if (await maybeUpdate("search", opts.format)) return;

    // TUI mode
    if (queries.length > 1) {
      const dropped = queries.slice(1).join(", ");
      console.error(
        `Note: TUI mode processes one query at a time. Dropped: ${dropped}. Use --format json for multiple queries.`,
      );
    }

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: App } = await import("./tui/App.tsx");

    const query = queries[0] ?? "";
    const instance = render(
      React.createElement(App, { query, tlds, onlyAvailable: opts.onlyAvailable, timeoutMs }),
      {},
    );

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

// --- suggest ---
program
  .command("suggest")
  .argument("[query]")
  .option("-p, --prefixes <prefixes>", "Comma-separated prefixes (default: get,use,try,my,go,join)")
  .option("-s, --suffixes <suffixes>", "Comma-separated suffixes (default: app,labs,hq,ly,dev,hub,run,kit)")
  .description("Generate name combinations and check availability")
  .action(async (query: string | undefined, opts) => {
    if (!query) {
      console.error("Usage: temper suggest <name> [-p get,use] [-s app,dev]");
      process.exit(1);
    }

    query = validateLabelOrExit(query, "name");

    const config = await loadConfig();
    setTheme(config.theme);

    const prefixes = opts.prefixes?.split(",").map((s: string) => s.trim());
    const suffixes = opts.suffixes?.split(",").map((s: string) => s.trim());

    if (await maybeUpdate("suggest")) return;

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: SuggestView } = await import("./tui/SuggestView.tsx");

    const instance = render(
      React.createElement(SuggestView, { query, prefixes, suffixes }),
      {},
    );

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

// --- init ---
program
  .command("init")
  .description("Set up temper (registrar + theme)")
  .action(async () => {
    const config = await loadConfig();
    setTheme(config.theme);

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: InitView } = await import("./tui/InitView.tsx");

    const instance = render(React.createElement(InitView, { currentConfig: config }), {});

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

// --- history ---
program
  .command("history")
  .description("Show search history")
  .action(async () => {
    const config = await loadConfig();
    setTheme(config.theme);

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: HistoryView } = await import("./tui/HistoryView.tsx");

    const instance = render(React.createElement(HistoryView), {});
    instance.waitUntilExit().then(() => process.exit(0));
  });

// --- watch ---
program
  .command("watch")
  .argument("<domain>")
  .description("Add a domain to watchlist")
  .action(async (domain: string) => {
    domain = validateDomainOrExit(domain, "domain");
    const { addWatch } = await import("./config/watchlist.ts");
    await addWatch(domain);
    console.log(`  ✓ Added ${domain} to watchlist`);
  });

// --- whois ---
program
  .command("whois")
  .argument("<domain>")
  .option("-f, --format <format>", "Output format (tui, json)", "tui")
  .option("-t, --timeout <seconds>", "Timeout in seconds", String(DEFAULT_WHOIS_TIMEOUT_SECONDS))
  .description("Show detailed WHOIS/RDAP info for a domain")
  .action(async (domain: string, opts) => {
    domain = validateDomainOrExit(domain, "domain");

    const config = await loadConfig();
    setTheme(config.theme);

    const timeoutMs = parseTimeoutMsOrExit(opts.timeout, "--timeout");

    if (opts.format === "json") {
      const { domainDetail } = await import("./checker/detail.ts");
      const result = await domainDetail(domain, { timeoutMs });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (await maybeUpdate("whois", opts.format)) return;

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: WhoisView } = await import("./tui/WhoisView.tsx");

    const instance = render(
      React.createElement(WhoisView, { domain, timeoutMs }),
      {},
    );

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

// --- list ---
program
  .command("list")
  .description("Show watchlist with current availability")
  .action(async () => {
    const config = await loadConfig();
    setTheme(config.theme);

    if (await maybeUpdate("list")) return;

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: WatchlistView } = await import("./tui/WatchlistView.tsx");

    const instance = render(React.createElement(WatchlistView), {});
    instance.waitUntilExit().then(() => process.exit(0));
  });

// --- extensions ---
program
  .command("extensions")
  .description("Discover extensions by industry, purpose and region (offline)")
  .option("--categories [facet]", "Show navigation summary, or classifications for industry, purpose or region")
  .option("--category <ids>", "Filter by industry IDs (comma-separated)")
  .option("--purpose <ids>", "Filter by website purpose IDs (comma-separated)")
  .option("--region <ids>", "Filter by geographic association IDs (e.g. GB,KR)")
  .option("--query <suffix>", "Find an extension (e.g. co.uk)")
  .option("--limit <count>", "Page size (default: 50; maximum: 100)")
  .option("--cursor <cursor>", "Continue the same filtered listing")
  .option("-f, --format <format>", "Output format (text, json)", "text")
  .addHelpText("after", "\nExamples:\n  temper extensions --categories\n  temper extensions --categories industry\n  temper extensions --category design-arts\n  temper extensions --purpose store\n  temper extensions --region GB\n  temper extensions --query co.uk\n  temper search mybrand --tlds design,studio,co.uk\n  temper search mybrand --category design-arts")
  .action(opts => console.log(extensionCommand(opts)));

// --- config ---
const configCmd = program
  .command("config")
  .description("Manage temper configuration");

configCmd
  .command("theme")
  .argument("[name]")
  .option("--list", "List available themes")
  .description("Set or list themes")
  .action(async (name: string | undefined, opts: { list?: boolean }) => {
    if (opts.list || !name) {
      const config = await loadConfig();
      for (const t of THEME_NAMES) {
        const marker = t === config.theme ? "▸" : " ";
        console.log(`  ${marker} ${t}`);
      }
      return;
    }

    if (!THEME_NAMES.includes(name)) {
      console.error(`Unknown theme: ${name}`);
      console.error(`Available: ${THEME_NAMES.join(", ")}`);
      process.exit(1);
    }

    await saveConfig({ theme: name });
    console.log(`Theme set to: ${name}`);
  });

// --- update ---
program
  .command("update")
  .description("Check for a new version and update after confirmation")
  .option("--check", "Show the published version and instructions without installing")
  .addHelpText("after", "\nAutomatic checks: interactive search, suggest, whois and list only; at most once per 24 hours.\nSet TEMPER_NO_UPDATE_CHECK=1 to disable automatic checks.\nManual checks bypass the cache. Updating requires a terminal; no --yes option.\nExamples:\n  temper update\n  temper update --check")
  .action(async opts => { await updateCommand(Boolean(opts.check)); });

// --- mcp ---
program
  .command("mcp")
  .description("Start MCP server over stdio")
  .action(async () => {
    const config = await loadConfig();
    setTheme(config.theme);

    const { startMcpServer } = await import("./mcp/server.ts");
    await startMcpServer();
  });

program.parseAsync().catch((error: unknown) => {
  exitWithError(error instanceof Error ? error.message : String(error));
});
