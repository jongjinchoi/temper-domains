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
- \`search_names\` - query up to 8 bare names across default, extended or selected suffixes; selected names × suffixes max 480. Do not combine tlds with extended, including false.
- \`suggest_domain\` - generate prefix/suffix combinations and check them with RDAP/WHOIS
- \`check_domain_availability\` - explicit full domains, or resume=true for exact prior unresolved domains on user request; maximum 100 per call
- \`whois_domain\` - registrar, expiry, nameserver lookup
- \`open_registrar\` - open purchase page in the browser

## Commands

- \`temper search <name>\` - check ${DEFAULT_TLDS_COUNT} TLDs, Enter to buy
- \`temper extensions --categories\` - browse industry, purpose and region classifications
- \`temper extensions --limit 100\` - browse the full supported catalog, following the next cursor
- \`temper search <name> --tlds com,co.uk\` - search only the selected suffixes
- \`temper search <name> --category design-arts\` - search the industry selection (max 480 name × suffix combinations)
- \`temper suggest <name>\` - prefix/suffix brainstorm
- \`temper whois <domain>\` - registrar details through the shared RDAP/WHOIS route
- \`temper watch <domain>\` - track availability, \`temper list\` to review
- \`temper history\` - interactive search history
- \`temper update\` - check now; verified global npm/Homebrew installs require confirmation before updating
- \`temper update --check\` - show published version and instructions without installing
- \`temper mcp\` - start the MCP stdio server

## Lookup limits

Local CLI/MCP commands sharing the same home persist server cooldowns in
~/.temper/state/lookup-limits.json. Server Retry-After takes precedence; otherwise
Temper applies a 60/120/240/480/900-second policy with 0–5 seconds of jitter.
After the wait, recovery proceeds one request at a time with conservative adaptive
spacing; one successful response does not reset the policy. There is no background retry.
server_cooldown with attempts=0 means no request was sent for that domain.
retryAt is an earliest retry time, not a success guarantee; retryAtSource is
server or client_policy. Do not bypass a cooldown by changing home or protocol.
State errors stop local requests; the hosted demo uses separate memory-only state.
Version 2 shared state preserves existing waits on migration and refuses active old
leases. Update older processes/reconnect MCP clients; do not delete cooldown state.
Lookup tools return structured rows, summary and retryPlan alongside text.
Resume only exact prior unresolved names when asked, with a 30s MCP lookup budget;
do not silently truncate over 100 names or automatically replay remaining pages.
TUI r/R resumes selected/visible unresolved candidates after confirmation (max 120s);
Esc stops a resume while keeping results, and u shows unresolved rows.

## CLI updates

Interactive temper/search/suggest/whois/list check the relevant npm registry or
Homebrew tap for a stable update on every invocation, with a 2-second automatic
check deadline. Failures are reported briefly without blocking the original command.
Later skips this invocation only. Set TEMPER_NO_UPDATE_CHECK=1 to disable automatic
checks; manual update checks bypass this opt-out. No cached result or earlier
postponement suppresses a fresh check. MCP, JSON, pipes, CI, help/version and offline
commands never check automatically. In a terminal, bare temper shows a welcome box;
temper help and temper --help display the same full command help in a box.
Checks send no domain names or history; the version services see normal connection metadata.
npx/local packages, direct downloads and unknown installers receive instructions.
After a confirmed update, verify the installed version and restart the CLI.

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
