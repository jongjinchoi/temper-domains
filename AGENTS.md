# AGENTS.md

## Project

temper is a Bun/TypeScript terminal-first domain discovery tool.

- CLI, TUI, checker, MCP server: `src/`
- Next.js marketing and live demo site: `web/`
- Assets and terminal recordings: `assets/`
- Current implementation notes: `docs/current.md`
- User guides: `docs/cli.md`, `docs/extensions.md`, `docs/troubleshooting.md`, `docs/mcp.md`
- License/source requirements: `docs/licensing.md`, `legal/inventory.json`
- Historical PRDs and mockups: `docs/archive/`

## Language

- Talk to the user in Korean with honorifics.
- Prefer English for code comments.

## Commands

- Root tests: `bun test`
- Root typecheck: `bun run typecheck`
- Real local TLS transport checks: `node tests/transport/runner.mjs`
- Shared CLI/MCP cooldown checks: `node tests/limits/runner.mjs` (after npm build)
- Bundled checker/evidence consistency: `bun run catalog:verify`
- npm package build: `bun run build:npm`
- Documentation contracts: `bun run docs:check` (help, links, labels and media; no live registry calls)
- Web dev: `bun run web:dev`
- Web typecheck: `bun run web:typecheck`
- Web build: `bun run web:build`
- Browser contract: `bash tests/browser/run.sh` (after web build and `node node_modules/playwright/cli.js install chromium`)
- Release artifact smoke: `bun tests/packaging/smoke.mjs npm <tgz>` or `bun tests/packaging/smoke.mjs native <target> <tar.gz>` on the target OS/CPU

Build commands can update generated output such as `dist/` or `.next/`; check the worktree before and after running them.
Ordinary npm/native compilation does not require Git or release metadata.
`npm pack` and native packaging create corresponding-source archives under `dist/`.
For public packaging, `TEMPER_PUBLIC_BUILD=1` checks the commit and only the
source archive's included inputs. Hosted web builds use deployment commit metadata
without requiring a clean worktree. Local packaging does not publish or install anything.

Install with `bun ci`. Development and local verification do not require an
exact Bun or Node.js version. The npm CLI requires Node.js >= 22.12.0.
Runtime code under `src/` must not use Bun-only APIs such as `Bun.*`: the npm
package is bundled for Node (`build-npm.ts` targets `node`), and
`bun run typecheck` does not catch them because `tsconfig.json` loads Bun types.
CI and release workflows select Bun `latest` and Node.js `lts/*`; compatibility
CI also checks the minimum supported Node.js version. Record the actual runtime
versions used for verification.

`bun test` preloads `tests/preload.ts` to isolate `homedir()` in a temporary
directory. Child-process regression tests also use temporary homes. RDAP calls
are mocked in tests; these tests do not query Production or update real user
configuration. The browser check in `tests/browser/playground.mjs` targets a
local server and intercepts valid `/api/check/` queries; invalid input exercises
the real local HTTP 400 path. Playwright is a development dependency; install its
Chromium separately. `tests/browser/run.sh` owns the local production server and
stops it on exit. It does not use the hosted site.
Package smoke installs npm artifacts only in a temporary directory, may download
npm dependencies, and removes its own fixture afterward. Native smoke extracts
the archive into a temporary directory. Both use isolated homes and offline CLI
commands; neither publishes, queries registries for domains, nor changes a global installation.
Transport checks start loopback TLS servers with temporary OpenSSL certificates,
exercise Bun and Node, and do not query public registries.
Shared cooldown checks also use temporary homes and loopback HTTP/WHOIS servers;
they do not query public registries or change real user state.

CI runs the shared cooldown and browser contracts. `CI / required` requires every
root/web/Node/updater job to succeed. Release does not rerun CI:
`scripts/verify-release-ci.mjs` requires successful main-push CI evidence,
including `CI / required`, for its exact commit before publication, and release
runs smoke checks on the artifacts it publishes. Branch rules
and Vercel Deployment Checks must be configured separately; changing workflows
does not itself enable remote enforcement.

## Source Of Truth

- Current project map: `docs/current.md`
- CLI commands and help text: `src/index.ts`
- Domain statuses, default/extended TLDs, prefixes, suffixes: `src/checker/types.ts`
- Extension discovery, classification, selection and bundled data: `src/extensions/`
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
- Run `bun run web:typecheck` after changing web TypeScript or TSX files, or root `src/` modules that the web imports (find them with `rg '\.\./src/' web`).
- Run `bun run src/index.ts --help` after changing CLI descriptions or command registration.
- Use `rg` to confirm stale public claims are gone after documentation or marketing copy updates.

## Git Hygiene

- The worktree may contain user changes. Do not revert changes you did not make.
- Stage only files related to the approved task.
- Prefer non-interactive git commands.
