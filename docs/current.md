# temper Current State

This file is the current implementation map for temper. Historical planning
documents live in `docs/archive/`.

## Project Shape

- Root package: Bun/TypeScript CLI, TUI, checker, MCP server.
- Web package: Next.js marketing site and hosted live demo under `web/`.
- Current npm package name: `temper-domains`.
- Current repository: `jongjinchoi/temper-domains`.
- License: Apache-2.0.

## Main Commands

- Root tests: `bun test`
- Root typecheck: `bun run typecheck`
- npm package build: `bun run build:npm`
- Binary build script: `bun run build.ts`
- CLI help check: `bun run src/index.ts --help`
- Web dev: `bun run web:dev`
- Web typecheck: `bun run web:typecheck`
- Web build: `bun run web:build`

Install with `bun ci`; Bun 1.4.2 is pinned in `packageManager`. Development and
CI use Node.js 24.21.0 from `.nvmrc`. TypeScript 7.0.2 is declared in both
workspaces so root typechecking does not download a separate compiler.

## Source Of Truth

- CLI commands and help: `src/index.ts`
- Default and extended TLDs: `src/checker/types.ts`
- RDAP bootstrap and cache: `src/checker/bootstrap.ts`
- RDAP lookup and parsing: `src/checker/rdap.ts`
- WHOIS fallback and parsing: `src/checker/whois.ts`
- Shared checker streaming scheduler: `src/checker/stream.ts`
- Single-domain RDAP/WHOIS lookup wrapper: `src/checker/lookup.ts`
- Availability metadata and input policy: `src/checker/policy.ts`
- PSL/IDN domain parsing: `src/utils/domain.ts`
- MCP tools: `src/mcp/server.ts`
- TUI screens: `src/tui/`
- Persistent CLI state: `src/config/`
- Registrar URLs and browser opening: `src/registrar/`
- Web synced copy/data: `web/lib/temper-data.ts`
- Hosted demo API route: `web/app/api/check/route.ts`
- Web serverless checker: `web/server/checker.ts`

## Current Behavior Notes

- Default search checks 30 TLDs.
- Extended search checks 59 TLDs.
- npm package version is sourced from `package.json`; source and bundled CLI version output should match.
- npm installs expose the `temper` binary and require Node.js >= 22.12.0.
- Binary releases target macOS, Linux, and Windows; the Homebrew tap covers macOS and Linux.
- CLI search defaults to a 5s timeout; hosted web demo checks use the API route's 3s timeout.
- CLI checker uses IANA RDAP bootstrap cached at `~/.temper/cache/rdap-dns.json` with a 7-day TTL.
- RDAP server selection uses RFC 9224-style label-wise longest match, not only the final label.
- Availability and detailed lookup results may include `confidence`, `reason`, `rdapKey`, `publicSuffix`, and `registrableDomain` metadata.
- Detailed lookup output describes a missing registration record and its review reason instead of claiming guaranteed purchase availability.
- Low-confidence available results are treated as review in MCP and web demo summaries.
- TUI suggest checks generated `.com` preview candidates through RDAP/WHOIS, then Enter opens a full TLD search.
- MCP `suggest_domain` checks generated combinations across `.com`, `.dev`, `.io`, `.app`, and `.ai` through RDAP/WHOIS.
- Watchlist refreshes use RDAP/WHOIS full-domain checks, not DNS NS lookup.
- Watchlist updates serialize the full read/modify/write operation with an
  exclusive local lock and replace the data file only after a temporary file
  is written and synced. Domain keys are case-insensitive.
- A lock waits up to 5s. A crashed writer may leave `watchlist.json.lock`;
  it is never deleted automatically while another writer might own it. After
  confirming no temper commands are running, remove only that lock and retry.
- Invalid config/history/watchlist files produce a repair message and are not
  silently overwritten with defaults. Back up the file before repairing it.
- TUI searches use lowercase result keys, show bootstrap failures as errors,
  and do not record a failed bootstrap as a successful search. Suggestion parent
  input is disabled while its child search is active.
- Hosted web demo uses a Next.js `/api/check/` route and an in-memory RDAP bootstrap cache.
- CLI and local MCP privacy claims do not apply to the hosted web demo.
- OG and Twitter images use the Node.js runtime; Next.js prerenders them at
  build time. Font downloads therefore remain a build-time network dependency.
- `temper mcp` starts a local stdio MCP server.
- MCP public copy should mention Codex, Claude, and Cursor when describing supported AI workflows.
- Codex setup should follow official OpenAI Codex MCP docs: `codex mcp add temper -- temper mcp` or `[mcp_servers.temper]` in `~/.codex/config.toml`.

## Documentation Sync

When public behavior changes, check whether these files also need updates:

- `README.md`
- `web/lib/temper-data.ts`
- `web/components/Hero.tsx`
- `web/components/Features.tsx`
- `web/components/Mcp.tsx`
- `web/app/layout.tsx`
- `web/app/opengraph-image.tsx`
- `web/app/llms.txt/route.ts`

Use `rg` to confirm stale claims are gone after copy updates.

## Internal Docs

- `docs/current.md`: current implementation reference.
- `docs/release.md`: release process.
- `docs/backlog.md`: current backlog and follow-up ideas.
- `docs/archive/`: historical PRDs, mockups, and design explorations.

Historical docs are useful for product intent, but they are not the source of truth for current behavior.
