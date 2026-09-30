#!/usr/bin/env node
import { Command, Option, InvalidArgumentError } from "commander";
import { getDomainInputError } from "./checker/policy.ts";
import { buildSuggestions, parseAffixes } from "./utils/suggestions.ts";
import { loadConfig, saveConfig } from "./config/config.ts";
import { THEME_NAMES, setTheme } from "./tui/theme.ts";
import { isValidDomain, isValidDomainLabel, sanitizeDomain } from "./utils/validate.ts";
import { VERSION } from "./version.ts";
import { formatStorageError } from "./utils/storage-error.ts";
import { installShutdownHandlers } from "./utils/shutdown.ts";
import { assertCandidateLimit, validateSearchCombinations, splitFilter } from "./extensions/input.ts";
import { maybeUpdate, updateCommand } from "./update/cli.ts";

const DEFAULT_WHOIS_TIMEOUT_SECONDS = 10;

function affixOption(value: string): string[] {
  try { return parseAffixes(value); }
  catch (error) { throw new InvalidArgumentError(error instanceof Error ? error.message : String(error)); }
}

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

function parseTimeoutMsOrExit(value: string, argName: string): number {
  const seconds = Number(value);
  const timeoutMs = Math.round(seconds * 1000);
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    exitWithError(`invalid ${argName} '${value}'. Expected seconds that round to between 1 and 2147483647 milliseconds.`);
  }
  return timeoutMs;
}

const program = new Command();

program
  .name("temper")
  .description("Never leave your terminal to find a domain.")
  .version(VERSION);

async function showStart(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || process.env.CONTINUOUS_INTEGRATION || process.env.BUILD_NUMBER) {
    program.outputHelp();
    return;
  }
  const config = await loadConfig();
  setTheme(config.theme);
  if (await maybeUpdate("temper")) return;
  const { showWelcome } = await import("./tui/Welcome.tsx");
  showWelcome();
}

// --- search ---
program
  .command("search")
  .argument("<queries...>")
  .option("--tlds <tlds>", "Only these comma-separated extensions (e.g. design,studio,co.uk)")
  .option("--category <ids>", "Search an industry classification (discover with extensions --categories industry)")
  .option("--extended", "Check 60 TLDs instead of 30")
  .option("-a, --only-available", "Show only available domains")
  .addOption(new Option("-f, --format <format>", "Output format").choices(["tui", "json"]).default("tui"))
  .option("-t, --timeout <seconds>", "Timeout per query name including bootstrap (default: automatic 5–30s)")
  .description("Search domain availability across TLDs")
  .action(async (queries: string[], opts) => {
    queries = queries.map((q) => validateLabelOrExit(q, "query"));

    // Explicit extensions keep precedence over the extended bundle.
    let tlds: string[] | undefined;
    if (opts.category !== undefined) {
      if (opts.tlds !== undefined || opts.extended !== undefined) throw new Error("--category cannot be combined with --tlds or --extended");
      const { resolveCategorySelection } = await import("./extensions/selection.ts");
      tlds = resolveCategorySelection({ industries: splitFilter(opts.category) });
      assertCandidateLimit(queries.length, tlds.length);
    } else if (opts.tlds !== undefined) {
      const { resolveExplicitSelection } = await import("./extensions/selection.ts");
      tlds = resolveExplicitSelection(opts.tlds.split(","));
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

    const config = await loadConfig();
    setTheme(config.theme);
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

    await instance.waitUntilExit();
  });

// --- suggest ---
program
  .command("suggest")
  .argument("[query]")
  .option("-p, --prefixes <prefixes>", "Comma-separated prefixes (default: get,use,try,my,go,join)", affixOption)
  .option("-s, --suffixes <suffixes>", "Comma-separated suffixes (default: app,labs,hq,ly,dev,hub,run,kit)", affixOption)
  .description("Generate name combinations and check availability")
  .action(async (query: string | undefined, opts) => {
    if (!query) {
      console.error("Usage: temper suggest <name> [-p get,use] [-s app,dev]");
      process.exit(1);
    }

    query = validateLabelOrExit(query, "name");
    const prefixes: string[] | undefined = opts.prefixes;
    const suffixes: string[] | undefined = opts.suffixes;
    buildSuggestions(query, prefixes, suffixes);

    const config = await loadConfig();
    setTheme(config.theme);

    if (await maybeUpdate("suggest")) return;

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: SuggestView } = await import("./tui/SuggestView.tsx");

    const instance = render(
      React.createElement(SuggestView, { query, prefixes, suffixes }),
      {},
    );

    await instance.waitUntilExit();
  });

// --- init ---
program
  .command("init")
  .description("Set up temper's theme")
  .action(async () => {
    const config = await loadConfig();
    setTheme(config.theme);

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: InitView } = await import("./tui/InitView.tsx");

    const instance = render(React.createElement(InitView, { currentConfig: config }), {});

    await instance.waitUntilExit();
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
    await instance.waitUntilExit();
  });

// --- watch ---
program
  .command("watch")
  .argument("<domain>")
  .description("Add a domain to watchlist")
  .action(async (domain: string) => {
    domain = validateDomainOrExit(domain, "domain");
    const inputError = getDomainInputError(domain);
    if (inputError) exitWithError(inputError);
    const { addWatch } = await import("./config/watchlist.ts");
    await addWatch(domain);
    console.log(`  ✓ Added ${domain} to watchlist`);
  });

// --- whois ---
program
  .command("whois")
  .argument("<domain>")
  .addOption(new Option("-f, --format <format>", "Output format").choices(["tui", "json"]).default("tui"))
  .option("-t, --timeout <seconds>", "Timeout in seconds", String(DEFAULT_WHOIS_TIMEOUT_SECONDS))
  .description("Show detailed WHOIS/RDAP info for a domain")
  .action(async (domain: string, opts) => {
    domain = validateDomainOrExit(domain, "domain");
    const inputError = getDomainInputError(domain);
    if (inputError && opts.format !== "json") exitWithError(inputError);

    const timeoutMs = parseTimeoutMsOrExit(opts.timeout, "--timeout");

    if (opts.format === "json") {
      const { domainDetail } = await import("./checker/detail.ts");
      const result = await domainDetail(domain, { timeoutMs });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const config = await loadConfig();
    setTheme(config.theme);
    if (await maybeUpdate("whois", opts.format)) return;

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: WhoisView } = await import("./tui/WhoisView.tsx");

    const instance = render(
      React.createElement(WhoisView, { domain, timeoutMs }),
      {},
    );

    await instance.waitUntilExit();
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
    await instance.waitUntilExit();
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
  .action(async opts => {
    const { extensionCommand } = await import("./extensions/cli.ts");
    console.log(extensionCommand(opts));
  });

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
  .option("--check", "Query a known release channel and show guidance without installing")
  .addHelpText("after", "\nAutomatic checks: interactive temper, search, suggest, whois and list; checked on every invocation.\nSet TEMPER_NO_UPDATE_CHECK=1 to disable automatic checks.\nLater skips only the current invocation. Updating requires a terminal; no --yes option.\nExamples:\n  temper update\n  temper update --check")
  .action(async opts => { await updateCommand(Boolean(opts.check)); });

// --- mcp ---
program
  .command("mcp")
  .description("Start MCP server over stdio")
  .action(async () => {
    const { startMcpServer } = await import("./mcp/server.ts");
    await startMcpServer();
  });

// Help stays synchronous once Commander starts parsing. Load the renderer only
// for interactive help so JSON/MCP/version paths keep their existing output.
async function main(): Promise<void> {
  const requestedHelp = process.argv.slice(2).some(arg => arg === "--help" || arg === "-h") || process.argv[2] === "help";
  if (requestedHelp && !process.argv.includes("--version") && !process.argv.includes("-V") && process.stdout.isTTY && !process.env.CI && !process.env.CONTINUOUS_INTEGRATION && !process.env.BUILD_NUMBER) {
    try {
      const config = await loadConfig();
      setTheme(config.theme);
    } catch (error) {
      console.error(`Could not read settings: ${formatStorageError(error)}`);
    }
    const [{ renderToString, Text }, { createElement }, { TerminalPanel }] = await Promise.all([
      import("ink"), import("react"), import("./tui/TerminalPanel.tsx"),
    ]);
    const columns = Math.max(10, process.stdout.columns || 80);
    const configure = (command: Command): void => {
      command.configureHelp({ helpWidth: Math.max(6, columns - 4) });
      command.configureOutput({ writeOut: text => {
        console.log(renderToString(createElement(TerminalPanel, { children: createElement(Text, {}, text.trimEnd()) }), { columns }));
      } });
      command.commands.forEach(configure);
    };
    configure(program);
  }

  // Let a file transaction finish before SIGINT, SIGTERM or SIGHUP ends the process.
  installShutdownHandlers();
  await (process.argv.length === 2 ? showStart() : program.parseAsync());
}

main().catch((error: unknown) => {
  console.error(`Error: ${formatStorageError(error)}`);
  process.exitCode = 1;
});
