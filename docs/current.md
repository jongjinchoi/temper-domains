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

Install with `bun ci`. Development and local verification have no exact Bun or
Node.js version requirement; the npm CLI requires Node.js >= 22.12.0. CI and
release workflows select Bun `latest` and Node.js `lts/*`. Record the actual
runtime versions used when reporting verification. TypeScript 7.0.2 is declared
in both workspaces so root typechecking does not download a separate compiler.

## Source Of Truth

- CLI commands and help: `src/index.ts`
- CLI update policy, installation ownership, cache and installer: `src/update/`
- Update confirmation and terminal handoff: `src/tui/UpdatePrompt.tsx`
- Default and extended TLDs: `src/checker/types.ts`
- Extension catalog, classifications and selection: `src/extensions/`
- Catalog snapshot maintenance: `scripts/update-extension-catalog.ts`
- Shared HTTP bootstrap cache: `src/checker/bootstrap-cache.ts`; disk adapter: `src/checker/bootstrap.ts`
- RDAP lookup and parsing: `src/checker/rdap.ts`
- Shared RDAP/WHOIS routing and service profiles: `src/checker/services.ts`
- ALPN HTTP/1.1 and HTTP/2 transport: `src/checker/http-transport.ts`
- WHOIS parsing: `src/checker/whois.ts`
- Shared batch lifecycle: `src/checker/batch.ts`, `src/checker/run.ts`
- Server scheduler and streaming: `src/checker/scheduler.ts`, `src/checker/stream.ts`
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

- `temper update` checks freshly and asks before installation; `--check` only reports.
  Global npm and the verified Homebrew tap are executable update targets; npx/local,
  source checkouts, direct downloads and unknown installers receive guidance.
- Only interactive search/suggest/whois/list perform automatic checks, after input
  validation and before mounting search UI. Success TTL is 24h, automatic preflight
  deadline 2s, failure backoff 1h; Later postpones 24h. `TEMPER_NO_UPDATE_CHECK=1`
  disables automatic checks. MCP/JSON/pipes/CI/help/version/offline commands are excluded.
- npm version discovery uses registry.npmjs.org; Homebrew uses the published
  jongjinchoi/homebrew-temper-domains formula on raw.githubusercontent.com.
  Checks do not send domains/history. Local cache is ~/.temper/cache/update.json.
  npm and Homebrew release availability are checked separately.
- Installation uses explicit confirmation, a per-installation local lock, fixed
  package/formula targets and fresh version verification. Homebrew refreshes metadata,
  preserves pins and asks again if its target changes. Installation failure does not
  imply rollback. Windows npm wrappers use the verified npm JS entry via Node.
  Existing Ink suspendTerminal hands input/output to the installer and restores it.
  Completion exits; it does not re-run the user's original command automatically.
- Default search checks 30 TLDs.
- Extended search checks 60 TLDs.
- npm package version is sourced from `package.json`; source and bundled CLI version output should match.
- npm installs expose the `temper` binary and require Node.js >= 22.12.0.
- Binary releases target macOS, Linux, and Windows; the Homebrew tap covers macOS and Linux.
- CLI/MCP searches automatically budget 5–30s, including bootstrap, using queued
  server start spacing plus a 5s request window. This estimate does not guarantee
  completion under congestion, slow responses or new server cooldowns. Explicit
  CLI search timeouts remain strict; detail uses 10s and hosted demo uses 3s.
- Actual requests share a process-local scheduler: at most 20 active requests,
  two per server origin and 300ms between starts. These are client policy values;
  separate hosted instances do not share a distributed rate limit.
- RDAP 429/503 retries re-enter the scheduler (at most two attempts). Retry-After
  seconds and HTTP dates are honored without truncation. When waiting would
  exceed the deadline, return the response with retryAt. HTTP 503 is a service
  error, not a rate_limited result.
- Search and detail validate HTTP 200 domain JSON, including identifier matching
  when present. Optional fields and unknown extensions are permitted; 404 needs
  no JSON body. These checks do not establish purchase or premium-sale status.
- Results preserve the status enum and add optional attempts, queueTimeMs,
  terminationReason and retryAt. MCP and web completion summaries report
  requested/attempted/answered/unresolved and measured elapsed time. done marks
  stream termination, not successful answers for every requested domain.
- Caller cancellation reaches queued/running lookups. Cancelling one caller does
  not cancel the shared bootstrap refresh or another caller's requests.
- IANA bootstrap uses the same HTTP freshness policy in CLI/MCP disk+memory and
  web memory-only adapters. Cache-Control, Age, Date and Expires determine
  freshness on every access; ETag/Last-Modified allow conditional revalidation.
  Expired entries are revalidated before use; failed refreshes do not serve stale
  data. Validated snapshots atomically replace ~/.temper/cache/rdap-dns.json;
  legacy raw JSON is accepted and revalidated. no-store removes persisted data.
  Published alternate endpoints are retained; HTTPS is preferred. Automatic
  endpoint failover is not used to bypass a server cooldown.
- RDAP server selection uses RFC 9224-style label-wise longest match, not only the final label.
- Input validation rejects URL syntax before IDN conversion, checks numeric
  labels without interpreting them as IP addresses, and rejects empty labels
  after conversion. CLI, MCP, hosted API and watchlist use the shared validators.
- Availability and detailed lookup results may include `confidence`, `reason`, `rdapKey`, `publicSuffix`, and `registrableDomain` metadata.
- Detailed lookup output describes a missing registration record and its review reason instead of claiming guaranteed purchase availability.
- Low-confidence available results are treated as review in MCP and web demo summaries.
- TUI suggest checks generated `.com` preview candidates through RDAP/WHOIS, then Enter opens a full TLD search.
- MCP `suggest_domain` checks generated combinations across `.com`, `.dev`, `.io`, `.app`, and `.ai` through RDAP/WHOIS.
- Watchlist refreshes use RDAP/WHOIS full-domain checks, not DNS NS lookup.
- Config, watchlist and history updates serialize the full read/modify/write operation with an
  exclusive local lock and replace the data file only after a temporary file
  is written, synced and closed. Watchlist domain keys are case-insensitive.
  Config partial updates read the latest settings under the lock, preserving
  other fields. Config symlinks retain the link and replace its resolved target;
  the temporary file and lock are placed beside that target.
- A lock waits up to 5s. A crashed writer may leave `config.json.lock`,
  `watchlist.json.lock` or `history.json.lock`;
  it is never deleted automatically while another writer might own it. After
  confirming no temper commands are running, remove only that lock and retry.
- Config failures before replacement preserve the existing file. Failures while
  cleaning up after replacement explicitly report that the settings were saved.
  Init blocks duplicate saves, displays failures for retry, and keeps a post-save
  cleanup warning visible. Exiting Init does not cancel an already started save.
- Invalid config/history/watchlist files produce a repair message and are not
  silently overwritten with defaults. Back up the file before repairing it.
- TUI searches use lowercase result keys, show bootstrap failures as errors,
  and do not record a failed bootstrap as a successful search. Suggestion parent
  input is disabled while its child search is active.
- Search filtering resets selection and scroll position as text changes. Displayed
  rows, keyboard actions and registrar targets use the same position normalized
  against the filtered list and terminal height. Empty results have no selection.
- Suggestions preserve display casing and share normalized result keys with the
  checker, including error rows. History save failures are shown separately from
  lookup results. History deletion checks the displayed snapshot under the lock;
  a changed list is refreshed for reselection without deleting an entry.
- Hosted web demo uses a Next.js `/api/check/` route and an in-memory RDAP bootstrap cache.
- CLI and local MCP privacy claims do not apply to the hosted web demo.
- The web demo supports Escape while searching, restores input focus after
  completion/error, and reports a stream ending without a terminal event as
  incomplete. Its input has an accessible name.
- OG and Twitter images use the Node.js runtime; Next.js prerenders them at
  build time. Font downloads therefore remain a build-time network dependency.
- `temper mcp` starts a local stdio MCP server.
- `list_supported_tlds` is offline. No arguments returns the 30/30/60 bundles
  and full catalog count; view=extensions offers paged discovery (50 default,
  100 maximum), view=categories exposes industry/purpose/region navigation.
- `search_domain` and `search_names` accept explicit `tlds`, including composite
  suffixes and supported IDNs. Selected searches never append defaults, reject
  any simultaneous `extended` argument and preserve every requested result.
  MCP selected searches and CLI `--category` cap name × suffix combinations at
  480. Existing CLI explicit `--tlds` is not newly capped.
- `temper extensions` exposes the same catalog and classification evidence.
  The old named presets were immediately replaced without aliases. No-input
  MCP discovery remains supported over stdio.
- MCP public copy should mention Codex, Claude, and Cursor when describing supported AI workflows.
- Codex setup should follow official OpenAI Codex MCP docs: `codex mcp add temper -- temper mcp` or `[mcp_servers.temper]` in `~/.codex/config.toml`.

## Regression Verification

`bun test` uses temporary homes and controlled network responses. Tests cover
concurrent config/watch/history updates, stale history deletion, failed file replacement, damaged storage preservation,
Init save/retry/cleanup handling, TUI case/error/filter/resize/navigation regressions,
and NDJSON completion/cancellation.
MCP tests exercise all seven tools over stdio, including invalid inputs and
network-free TLD catalog discovery; registrar
opening is captured as a URL without launching a real browser.

Node compatibility CI is configured to run the built CLI and MCP, shared validation, and
the web route, config concurrent writers/readers and SearchView filtering with isolated homes and controlled RDAP responses on the minimum
supported Node.js 22.12.0 and the Node.js LTS selected by `lts/*`.
Run from the repository root:

```bash
bun run build:npm
bun build tests/runtime/entry.ts --target=node --packages=external --outfile=dist/test-runtime/entry.js
node --test tests/runtime/node-checks.mjs
```

These checks do not contact registries or modify real user configuration.

Local verification on 2026-09-21 for config transactions and search filtering
(macOS arm64): Bun 1.3.13 passed 248 tests / 803 assertions; root typecheck and
npm build passed. Node 24.19.0 passed all 12 runtime cases. Real CLI config
commands, in isolated homes, passed 60 concurrent pairs and 30 sequential pairs
per runtime with no invalid final JSON or failed command. A separate Node CLI
check used real RDAP responses and OS PTYs at 110×24 and 110×40; both answered
30/30 domains and displayed the single filtered row before Enter after scrolling.
This was not a manual GUI terminal check or remote CI/deployment verification.

Local verification on 2026-09-20 for input validation, history transactions and
suggestion result keys (macOS arm64): Bun 1.4.2 `bun test` passed 221 tests / 658
assertions; root/web typechecks and npm/web builds passed with Node 24.21.0.
The Node runtime checks above passed all nine cases on both Node 22.12.0 and
24.21.0, including concurrent history writers and suggestion rendering. This is
local evidence; GitHub Actions, publication and hosted Production were not run.

For the browser check, start the locally built site, then run:

```bash
TEMPER_TEST_URL=http://127.0.0.1:3000 node tests/browser/playground.mjs
```

This check requires Playwright/Chromium to be available. If installed outside
the repository, set `TEMPER_PLAYWRIGHT_MODULE` to its ESM entry point. The script
intercepts API calls and checks Escape, input focus, accessible name, incomplete
streams, and page width at 390px/1440px. It does not access a hosted service.

### Previous dependency-upgrade verification — 2026-09-19 (before RDAP changes)

Commands ran from the repository root on macOS arm64 with Bun 1.4.2 and
Node.js 24.21.0, except the explicit Node.js 22.12.0 compatibility checks.

| Check | Observed result |
| --- | --- |
| `bun ci` in a clean temporary source copy | Passed; lockfile unchanged |
| `bun test` | 173 passed, 0 failed, 475 assertions |
| `bun run typecheck` / `bun run web:typecheck` | Both passed |
| `bun run build:npm` / `bun run web:build` | Both passed |
| `bun run build.ts` | All five target binaries built |
| macOS arm64 binary `--help` | Passed |
| Node.js 22.12.0 and 24.21.0, compiled CLI | Search, config, concurrent watch writes, damaged config handling, and interactive TUI passed |
| `node tests/browser/playground.mjs` against the built local site | Escape, focus, accessible input, incomplete stream, and 390px/1440px page width passed |

Network-dependent CLI, TUI, MCP, and browser cases used controlled responses.
These results do not establish hosted Production behavior, live registry
availability, or runtime compatibility of the other four binary targets.
GitHub Actions and publication were not run. Full local command logs are in
`/tmp/temper-implementation-20260919/` and are temporary verification artifacts.

Implementation references: [Node.js file operations](https://nodejs.org/docs/latest-v24.x/api/fs.html),
[React effect cleanup](https://react.dev/reference/react/useEffect),
[Ink 7.1.1 input activation](https://github.com/vadimdemedes/ink/tree/v7.1.1#useinputinputhandler-options),
[Next.js Edge runtime migration](https://nextjs.org/docs/messages/edge-runtime-deprecated),
and [CSS Grid track sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-columns).

### RDAP reliability verification — 2026-09-19 (local implementation)

On `fix/rdap-reliability`, 203 tests / 549 assertions passed; root/web typechecks
and npm/web builds passed. Node 22.12 and 24.21 compiled CLI/MCP checks verified
all 59 results with a shared-server fixture, strict explicit deadlines and
cancellation. The browser regression verified partial coverage and cancellation
against a local built site. Real-network CLI checks separately returned 59/59
results (53 RDAP, 6 WHOIS) in 7.127s for one random name, plus taken responses
for example.com/net/org and detail for example.com. This does not establish
purchase availability or deployed Production behavior.

Execution scope, commands and evidence are recorded in
[the RDAP implementation plan](superpowers/plans/2026-09-19-rdap-reliability.md).

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


## Extension catalog maintenance

The initial bundled catalog contains 756 offered extensions passing Temper's
registration-boundary and route checks (738 RDAP, 18 WHOIS). These are static
support checks, not 756 successful live registry calls or a worldwide total.
The inputs combine 1,062 registration suffixes from Porkbun, Dynadot and Gandi.
Default 30/extended 60 are approved quick-search bundles within this catalog.

The runtime snapshot is `src/extensions/data/catalog.json`. It contains IANA/
PSL boundary data, offering evidence, classification reviews, lookup observations,
full endpoint plans and checker signatures together.
`commercial.json`, `overrides.json`, `regions.json`, `captures.json` and
`reviews.json` are maintenance inputs;
runtime does not mix them into an independently updated snapshot. Each
classification records its reason, source, evidence type and checked date.
Entries without industry/purpose evidence remain explicitly unclassified.
Registration qualification metadata is not collected, displayed or a search gate.
The current bundle has 221 industry/purpose-classified entries and 535 deferred
entries. Deferred records distinguish insufficient inspected evidence from a
source that could not be retrieved; they do not establish that no evidence exists
elsewhere. Category inclusion/exclusion rules live in `taxonomy.ts`.

Maintain a complete capture directory containing:

- `roots.txt`: https://data.iana.org/TLD/tlds-alpha-by-domain.txt
- `public_suffix_list.dat`: https://publicsuffix.org/list/public_suffix_list.dat
- `rdap.json`: https://data.iana.org/rdap/dns.json
- `commercial.json`: reviewed complete offering lists from at least two providers,
  using the checked-in schema (provider, source URL, actual checkedAt date,
  normalized suffixes and optional sourceBySuffix for product-page evidence).
- `overrides.json`, `regions.json`: reviewed classification and namespace evidence.
- `captures.json`: URL, SHA-256 and actual capture date for each raw structural input.
- `reviews.json`: captured purpose sources (URL, hash, date, locator and claim),
  per-entry review decisions bound to source/assignment/rule hashes, and dated
  lookup observations with route, parser, checker hash, runtime and attempts.

Do not label a failed/partial capture as a complete provider list. Preserve
individual source dates; refreshing boundaries does not reverify older offers.
The initial sources are https://porkbun.com/products/domains,
https://www.dynadot.com/domain/prices and https://www.gandi.net/en-US/domain/tld.
Gandi umbrella products ck/jm/mm/np/pg are expanded into the actual suffixes
shown on their product pages; retain those per-suffix evidence URLs.

```sh
bun run catalog:update /path/to/capture          # preview only
bun run catalog:update /path/to/capture --apply  # explicitly replace the bundle
```

The command reads all saved inputs without network downloads, validates source
and classification integrity, and previews additions/removals, endpoint/parser
changes, classification/review changes, unclassified entries and source counts.
Saved-source capture dates are preserved; `generatedAt` is the separate bundle
generation date. Invalid data, stale assigned reviews, missing providers and
unexpected large shrinkage fail without replacing the previous snapshot.
A single temporary-file rename publishes all runtime evidence together.
Review the preview and Git diff; normal builds, installs and catalog browsing
never run this command. The existing RDAP bootstrap network cache is separate.
`bun run catalog:verify` checks that bundled checker signatures match the sources
and lockfile, and that assigned classifications match their captured evidence
and the current classification rules. npm, standalone binary and web builds run this guard. Release
verification also runs the npm build before compiling platform binaries.
Refreshing signatures makes old
observations require rechecking; it does not manufacture a new server success.
Historical successful observations remain visible after route or checker changes.
No automatic live probe runs while listing extensions or building the package.
Do not retrieve the PSL more than once per 24 hours. Preserve source attribution;
PSL data is provided under Mozilla Public License 2.0 (https://publicsuffix.org/list/).
Dependency/parser changes and new providers require their own scope review.

Verification uses temporary homes and controlled RDAP responses: exhaustive
756-entry paging and selection, 30/60 bundles, composite suffixes, invalid-input
zero-lookups, the 480 boundary, partial results and snapshot failure preservation.
Node CLI/MCP integration uses `tests/runtime/node-checks.mjs`; these tests do
not make live registry calls or update the installed/connected MCP process.
`node tests/transport/runner.mjs` additionally starts local TLS servers and checks
the actual Bun/Node transports, ALPN, compression, redirects, certificate rejection,
cancellation and retry limits. It needs OpenSSL and uses temporary certificates;
it does not query public registries. Live registry observations are separate
evidence, not a consequence of these controlled tests passing.
