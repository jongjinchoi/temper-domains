import {
  DEFAULT_TLDS_COUNT,
  EXTENDED_TLDS_COUNT,
  getVersion,
  INSTALL_CMD,
  SITE_URL,
} from "@/lib/temper-data";

export const dynamic = "force-static";

function renderLlmsTxt(): string {
  const version = getVersion();

  return `# temper

> A terminal-first CLI for checking domain availability across ${DEFAULT_TLDS_COUNT} TLDs by default with a 3s timeout. MCP-native so Codex, Claude, Cursor, and other AI assistants can search on your behalf.

## What it is

temper is an open-source command-line tool that queries RDAP (with WHOIS fallback) to check domain availability. The CLI and MCP server run on the user's machine with zero telemetry and no temper-hosted query proxy. The hosted web demo uses a server-side API route for live checks.

- License: Apache 2.0
- Language: TypeScript, built on the Bun runtime
- Platforms: macOS, Linux
- Install: \`${INSTALL_CMD}\`
- Current version: ${version}
- Source: https://github.com/jongjinchoi/temper-domains
- Author: Jongjin Choi (https://jongjinchoi.com)

## Features

- ${DEFAULT_TLDS_COUNT} TLDs per search by default (${EXTENDED_TLDS_COUNT} with \`--extended\`, custom list via \`--tlds\`, or presets: \`tech\`, \`popular\`, \`startup\`, \`cheap\`)
- Interactive TUI (Ink + React) with vim-style navigation (j/k, /, a, s, h)
- MCP server mode for Codex CLI/IDE, Claude Desktop, Claude Code, Cursor, Windsurf, and Cline
- JSON output for shell piping (\`--format json\`)
- 7 built-in themes (5 dark, 2 light)
- Private by default for CLI/MCP - no telemetry and no temper-hosted query proxy

## MCP tools

- \`search_domain\` - query one bare name across default or extended TLDs
- \`search_names\` - query multiple bare name candidates, default TLDs first
- \`suggest_domain\` - generate prefix/suffix combinations and check them with RDAP/WHOIS
- \`check_domain_availability\` - explicit full-domain check only
- \`whois_domain\` - registrar, expiry, nameserver lookup
- \`open_registrar\` - open purchase page in the browser

## Commands

- \`temper search <name>\` - check ${DEFAULT_TLDS_COUNT} TLDs, Enter to buy
- \`temper suggest <name>\` - prefix/suffix brainstorm
- \`temper whois <domain>\` - RDAP-first registrar details
- \`temper watch <domain>\` - track availability, \`temper list\` to review
- \`temper history\` - interactive search history
- \`temper mcp\` - start the MCP stdio server

## Docs

- README: https://github.com/jongjinchoi/temper-domains/blob/main/README.md
- Releases / changelog: https://github.com/jongjinchoi/temper-domains/releases
- Live demo: ${SITE_URL}
`;
}

export function GET() {
  return new Response(renderLlmsTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
