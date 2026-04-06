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
  .description("Search domain availability across 30 TLDs")
  .action(async (query: string | undefined) => {
    if (!query) {
      console.error("Usage: temper search <name>");
      process.exit(1);
    }

    const config = await loadConfig();
    setTheme(config.theme);

    const { render } = await import("ink");
    const React = (await import("react")).default;
    const { default: App } = await import("./tui/App");

    const isTTY = process.stdin.isTTY;
    const instance = render(React.createElement(App, { query }), {
      ...(isTTY ? { alternateScreen: true } : { stdin: false as never }),
    });

    instance.waitUntilExit().then(() => {
      process.exit(0);
    });
  });

program
  .command("suggest")
  .argument("[query]")
  .description("Generate name combinations and check .com availability")
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
