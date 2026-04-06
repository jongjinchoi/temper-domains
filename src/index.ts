import { Command } from "commander";
import { loadConfig, saveConfig } from "./config/config";
import { THEME_NAMES, setTheme } from "./tui/theme";

const program = new Command();

program
  .name("temper")
  .description("Never leave your terminal to find a domain.")
  .version("0.1.0");

// --- search ---
program
  .command("search")
  .argument("<queries...>")
  .option("--tlds <tlds>", "Comma-separated TLDs (e.g. com,io,dev)")
  .option("--tld-preset <preset>", "TLD preset (popular, tech, startup, cheap)")
  .option("--extended", "Check 59 TLDs instead of 30")
  .option("-a, --only-available", "Show only available domains")
  .option("-f, --format <format>", "Output format (tui, json)", "tui")
  .option("-t, --timeout <seconds>", "Timeout in seconds (default: 3)", "3")
  .description("Search domain availability across TLDs")
  .action(async (queries: string[], opts) => {
    const config = await loadConfig();
    setTheme(config.theme);

    // Resolve TLDs: --tlds > --tld-preset > --extended > default
    let tlds: string[] | undefined;
    if (opts.tlds) {
      tlds = opts.tlds.split(",").map((t: string) => t.replace(/^\./, "").trim());
    } else if (opts.tldPreset) {
      const { TLD_PRESETS } = await import("./checker/types");
      tlds = TLD_PRESETS[opts.tldPreset] ? [...TLD_PRESETS[opts.tldPreset]] : undefined;
      if (!tlds) {
        console.error(`Unknown preset: ${opts.tldPreset}`);
        console.error(`Available: ${Object.keys(TLD_PRESETS).join(", ")}`);
        process.exit(1);
      }
    } else if (opts.extended) {
      const { EXTENDED_TLDS } = await import("./checker/types");
      tlds = [...EXTENDED_TLDS];
    }

    const timeoutMs = parseInt(opts.timeout, 10) * 1000;

    // JSON output mode — no Ink
    if (opts.format === "json") {
      const { checkDomains } = await import("./checker/checker");
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

    // TUI mode
    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: App } = await import("./tui/App");

    // For TUI, process one query at a time
    const query = queries[0];
    const isTTY = process.stdin.isTTY;
    const instance = render(
      React.createElement(App, { query, tlds, onlyAvailable: opts.onlyAvailable, timeoutMs }),
      { ...(isTTY ? { alternateScreen: true } : { stdin: false as never }) },
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

    const config = await loadConfig();
    setTheme(config.theme);

    const prefixes = opts.prefixes?.split(",").map((s: string) => s.trim());
    const suffixes = opts.suffixes?.split(",").map((s: string) => s.trim());

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: SuggestView } = await import("./tui/SuggestView");

    const isTTY = process.stdin.isTTY;
    const instance = render(
      React.createElement(SuggestView, { query, prefixes, suffixes }),
      { ...(isTTY ? { alternateScreen: true } : { stdin: false as never }) },
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
    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: InitView } = await import("./tui/InitView");

    const isTTY = process.stdin.isTTY;
    const instance = render(React.createElement(InitView), {
      ...(isTTY ? {} : { stdin: false as never }),
    });

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

// --- history ---
program
  .command("history")
  .description("Show search history")
  .action(async () => {
    const { loadHistory } = await import("./config/history");
    const history = await loadHistory();

    if (history.length === 0) {
      console.log("  No search history yet.");
      return;
    }

    for (const entry of history) {
      const date = new Date(entry.timestamp);
      const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      console.log(
        `  ${dateStr}  ${entry.query.padEnd(20)} ${entry.available}/${entry.total} available`,
      );
    }
  });

// --- watch ---
program
  .command("watch")
  .argument("<domain>")
  .description("Add a domain to watchlist")
  .action(async (domain: string) => {
    const { addWatch } = await import("./config/watchlist");
    await addWatch(domain);
    console.log(`  ✓ Added ${domain} to watchlist`);
  });

// --- list ---
program
  .command("list")
  .description("Show watchlist with current availability")
  .action(async () => {
    const { loadWatchlist } = await import("./config/watchlist");
    const { dnsCheck } = await import("./checker/dns");

    const watchlist = await loadWatchlist();

    if (watchlist.length === 0) {
      console.log("  Watchlist is empty. Use: temper watch <domain>");
      return;
    }

    console.log("");
    for (const entry of watchlist) {
      const status = await dnsCheck(entry.domain);
      const icon = status === "available" ? "✓" : "✗";
      const color = status === "available" ? "\x1b[32m" : "\x1b[31m";
      const reset = "\x1b[0m";
      const dateStr = new Date(entry.addedAt).toLocaleDateString();
      const suffix = status === "available" ? "  ← available!" : "";
      console.log(
        `  ${color}${icon}${reset} ${entry.domain.padEnd(25)} ${color}${status.padEnd(12)}${reset} added ${dateStr}${suffix}`,
      );
    }
    console.log("");
  });

// --- show-presets ---
program
  .command("show-presets")
  .description("Show available TLD presets")
  .action(async () => {
    const { TLD_PRESETS } = await import("./checker/types");
    for (const [name, tlds] of Object.entries(TLD_PRESETS)) {
      console.log(`  ${name.padEnd(10)} ${(tlds as readonly string[]).join(", ")}`);
    }
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

// --- mcp ---
program
  .command("mcp")
  .description("Start MCP server for Claude Code/Desktop")
  .action(async () => {
    const config = await loadConfig();
    setTheme(config.theme);

    const { startMcpServer } = await import("./mcp/server");
    await startMcpServer();
  });

program.parse();
