import { Command } from "commander";

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
  .command("mcp")
  .description("Start MCP server for Claude Code/Desktop")
  .action(async () => {
    const { startMcpServer } = await import("./mcp/server");
    await startMcpServer();
  });

program.parse();
