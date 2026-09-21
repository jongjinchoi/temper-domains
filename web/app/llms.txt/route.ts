import {
  SEARCH_TIMEOUT_DESCRIPTION,
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

> A terminal-first CLI for checking domain availability across ${DEFAULT_TLDS_COUNT} TLDs by default with an ${SEARCH_TIMEOUT_DESCRIPTION}. MCP-native so Codex, Claude, Cursor, and other AI assistants can search on your behalf.

## What it is

temper is an open-source command-line tool that uses official RDAP and WHOIS routes to check domain availability. The CLI and MCP server run on the user's machine with zero telemetry and no temper-hosted query proxy. The hosted web demo uses a server-side API route for live checks.

- License: Apache 2.0
- Language: TypeScript, built on the Bun runtime
- Platforms: macOS, Linux, Windows
- Install: \`${INSTALL_CMD}\` or \`npm i -g temper-domains\`
- Current version: ${version}
- Source: https://github.com/jongjinchoi/temper-domains
- Author: Jongjin Choi (https://jongjinchoi.com)

## Features

- ${DEFAULT_TLDS_COUNT} TLDs per search by default (${EXTENDED_TLDS_COUNT} with \`--extended\`, custom list via \`--tlds\`, or industry selection via \`--category\`)
- Offline extension discovery by industry, purpose and region; default 50 per page, max 100. Catalog size is separate from page size and search bundles.
- Interactive TUI (Ink + React) with vim-style navigation (j/k, /, a, s, h)
- MCP server mode for Codex CLI/IDE, Claude Desktop, Claude Code, Cursor, Windsurf, and Cline
- JSON output for shell piping (\`--format json\`)
- Availability metadata can include confidence, reason, RDAP key, public suffix, and registrable domain; low-confidence availability needs registrar review
- 7 built-in themes (5 dark, 2 light)
- Private by default for CLI/MCP - no telemetry and no temper-hosted query proxy

## MCP tools

- \`list_supported_tlds\` - offline discovery. No arguments returns default/additional/extended bundles plus full catalog count; view=extensions browses the catalog with cursor paging, view=categories lists classification facets (facet=industry|purpose|region for details).
- \`search_domain\` - query one bare name across default or extended TLDs, or only suffixes supplied in tlds (including co.uk)
- \`search_names\` - query up to 8 bare names across default, extended or selected suffixes; selected names × suffixes max 472. Do not combine tlds with extended, including false.
- \`suggest_domain\` - generate prefix/suffix combinations and check them with RDAP/WHOIS
- \`check_domain_availability\` - explicit full-domain check only
- \`whois_domain\` - registrar, expiry, nameserver lookup
- \`open_registrar\` - open purchase page in the browser

## Commands

- \`temper search <name>\` - check ${DEFAULT_TLDS_COUNT} TLDs, Enter to buy
- \`temper extensions --categories\` - browse industry, purpose and region classifications
- \`temper extensions --limit 100\` - browse the full supported catalog, following the next cursor
- \`temper search <name> --tlds com,co.uk\` - search only the selected suffixes
- \`temper search <name> --category design-arts\` - search the industry selection (max 472 name × suffix combinations)
- \`temper suggest <name>\` - prefix/suffix brainstorm
- \`temper whois <domain>\` - registrar details through the shared RDAP/WHOIS route
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
