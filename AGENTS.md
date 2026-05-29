# AGENTS.md

## Project

temper is a Bun/TypeScript terminal-first domain discovery tool.

- CLI, TUI, checker, MCP server: `src/`
- Next.js marketing and live demo site: `web/`
- Assets and terminal recordings: `assets/`
- Current implementation notes: `docs/current.md`
- Historical PRDs and mockups: `docs/archive/`

## Language

- Talk to the user in Korean with honorifics.
- Prefer English for code comments.

## Commands

- Root tests: `bun test`
- npm package build: `bun run build:npm`
- Web dev: `cd web && npm run dev`
- Web typecheck: `cd web && npm run typecheck`
- Web build: `cd web && npm run build`

Build commands can update generated output such as `dist/` or `.next/`; check the worktree before and after running them.

## Source Of Truth

- Current project map: `docs/current.md`
- CLI commands and help text: `src/index.ts`
- Domain statuses, TLDs, presets, prefixes, suffixes: `src/checker/types.ts`
- RDAP/WHOIS lookup behavior: `src/checker/`
- MCP tools and tool descriptions: `src/mcp/server.ts`
- TUI themes: `src/tui/theme.ts`
- Web synced display data: `web/lib/temper-data.ts`
- Web live check API: `web/app/api/check/route.ts`
- Web server-side checker: `web/server/checker.ts`

When README, website copy, or `llms.txt` describes runtime behavior, verify it against the source above before changing copy.

## Documentation Rules

- Keep README, `web/lib/temper-data.ts`, web components, metadata, OG image text, and `web/app/llms.txt/route.ts` aligned when changing public-facing claims.
- When changing MCP guidance, check whether README, `web/components/Mcp.tsx`, `web/lib/temper-data.ts`, `web/app/layout.tsx`, and `web/app/llms.txt/route.ts` also need updates.
- For Codex-specific guidance, verify against official OpenAI Codex documentation first.
- Do not claim hosted web demo queries run locally. The hosted demo uses the Next.js `/api/check/` route.
- CLI/MCP local privacy claims apply to local CLI and local MCP server flows, not the hosted web demo.
- Keep current documentation in `docs/current.md`, `docs/release.md`, and `docs/backlog.md`.
- Keep old planning material in `docs/archive/`; do not treat archived PRDs as current implementation truth.

## Verification

- Run `bun test` after changing shared data, checker behavior, MCP tools, README sync points, or `web/lib/temper-data.ts`.
- Run `cd web && npm run typecheck` after changing web TypeScript or TSX files.
- Run `bun run src/index.ts --help` after changing CLI descriptions or command registration.
- Use `rg` to confirm stale public claims are gone after documentation or marketing copy updates.

## Git Hygiene

- The worktree may contain user changes. Do not revert changes you did not make.
- Stage only files related to the approved task.
- Prefer non-interactive git commands.
