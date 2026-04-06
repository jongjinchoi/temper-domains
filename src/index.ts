import { Command } from "commander";
import { loadConfig, saveConfig } from "./config/config";
import { THEME_NAMES, setTheme } from "./tui/theme";

const program = new Command();

program
  .name("temper")
  .description("Never leave your terminal to find a domain.")
  .version("0.1.0");

program
  .command("search")
  .argument("[query]")
  .option("--tlds <tlds>", "Comma-separated TLDs to check (e.g. com,io,dev)")
  .option("--extended", "Check 64 TLDs instead of 30")
  .description("Search domain availability across TLDs")
  .action(async (query: string | undefined, opts: { tlds?: string; extended?: boolean }) => {
    if (!query) {
      console.error("Usage: temper search <name> [--tlds=com,io,dev] [--extended]");
      process.exit(1);
    }

    const config = await loadConfig();
    setTheme(config.theme);

    let tlds: string[] | undefined;
    if (opts.tlds) {
      tlds = opts.tlds.split(",").map((t) => t.replace(/^\./, "").trim());
    } else if (opts.extended) {
      const { EXTENDED_TLDS } = await import("./checker/types");
      tlds = [...EXTENDED_TLDS];
    }

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: App } = await import("./tui/App");

    const isTTY = process.stdin.isTTY;
    const instance = render(React.createElement(App, { query, tlds }), {
      ...(isTTY ? { alternateScreen: true } : { stdin: false as never }),
    });

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

program
  .command("suggest")
  .argument("[query]")
  .description("Generate name combinations and check availability")
  .action(async (query: string | undefined) => {
    if (!query) {
      console.error("Usage: temper suggest <name>");
      process.exit(1);
    }

    const config = await loadConfig();
    setTheme(config.theme);

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: SuggestView } = await import("./tui/SuggestView");

    const isTTY = process.stdin.isTTY;
    const instance = render(React.createElement(SuggestView, { query }), {
      ...(isTTY ? { alternateScreen: true } : { stdin: false as never }),
    });

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

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

program
  .command("watch")
  .argument("<domain>")
  .description("Add a domain to watchlist")
  .action(async (domain: string) => {
    const { addWatch } = await import("./config/watchlist");
    await addWatch(domain);
    console.log(`  ✓ Added ${domain} to watchlist`);
  });

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
