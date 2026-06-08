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
- npm package build: `bun run build:npm`
- Binary build script: `bun run build.ts`
- CLI help check: `bun run src/index.ts --help`
- Web dev: `cd web && npm run dev`
- Web typecheck: `cd web && npm run typecheck`
- Web build: `cd web && npm run build`

## Source Of Truth

- CLI commands and help: `src/index.ts`
- Default and extended TLDs: `src/checker/types.ts`
- RDAP bootstrap and cache: `src/checker/bootstrap.ts`
- RDAP lookup and parsing: `src/checker/rdap.ts`
- WHOIS fallback and parsing: `src/checker/whois.ts`
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
- CLI checker uses IANA RDAP bootstrap cached at `~/.temper/cache/rdap-dns.json` with a 7-day TTL.
- TUI suggest checks generated `.com` preview candidates through RDAP/WHOIS, then Enter opens a full TLD search.
- MCP `suggest_domain` checks generated combinations across `.com`, `.dev`, `.io`, `.app`, and `.ai` through RDAP/WHOIS.
- Watchlist refreshes use RDAP/WHOIS full-domain checks, not DNS NS lookup.
- Hosted web demo uses a Next.js `/api/check/` route and an in-memory RDAP bootstrap cache.
- CLI and local MCP privacy claims do not apply to the hosted web demo.
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
