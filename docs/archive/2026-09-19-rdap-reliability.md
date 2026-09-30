# RDAP reliability implementation

Approved in conversation on 2026-09-19; base 647a1c4. Scope: scheduler,
retry/deadline/cancellation, bootstrap cache, response validation, completion
reporting and directly affected documentation. No premium API, dependency update,
commit, merge, push, release or deployment in this implementation approval.

1. Reproduce shared-server starvation, early Retry-After, incomplete reporting.
2. Schedule actual network work fairly across servers with process-wide limits;
   retries re-enter the same queue and observe the latest cooldown.
3. Separate whole-run budget (including bootstrap), request timeout and caller
   cancellation. Keep explicit deadlines; automatic CLI/MCP budgets 5–30 s are
   product policy, not an RFC guarantee. Request timeout starts at dispatch (5 s).
4. Share bootstrap HTTP cache policy between disk/memory and memory-only adapters;
   revalidate, retain validators, validate before atomic replacement, read legacy.
5. Share RDAP interpretation; validate successful domain objects, retain optional
   fields/extensions and empty 404 support. Report attempts and termination reason.
6. Propagate cancellation and actual elapsed/coverage to MCP, TUI and web; preserve
   status enum, CLI JSON array, web 3 s budget and backwards-compatible fields.
7. Run focused regressions, full tests/types/builds, CLI/MCP/browser checks and
   separately label real-network evidence. Review the final diff and limitations.

Official references checked:
- https://www.rfc-editor.org/rfc/rfc7480.html (HTTP/404/429)
- https://www.rfc-editor.org/rfc/rfc9083.html (domain objects)
- https://www.rfc-editor.org/rfc/rfc9224.html (bootstrap/HTTPS/cache)
- https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after
- https://www.rfc-editor.org/rfc/rfc9111.html (HTTP cache freshness/revalidation)
- https://nodejs.org/download/release/v22.12.0/docs/api/globals.html
- https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation

Verification results will be appended after execution. Tests use temporary homes
and mocked/local RDAP endpoints; they do not establish production behavior.

## Execution and verification

Implemented on `fix/rdap-reliability` in `.worktrees/rdap-reliability`, based on
647a1c4. Dependencies and package version are unchanged. The main checkout is
unchanged. At the initial implementation verification, no commit, integration
or publication had been performed.

Decisions within the approved plan:
- One fair process-wide scheduler accounts only for dispatched work. Server
  identity is URL origin, so path aliases cannot evade the same host's cooldown.
- Automatic budgets remain the proposed 5–30s policy. They accommodate known
  start spacing; they cannot guarantee all responses under congestion.
- Expired bootstrap data is revalidated synchronously. On refresh failure it is
  not served stale. This conservative policy honors no-cache/must-revalidate;
  no undocumented stale extension or arbitrary replacement TTL is introduced.
- Published alternate URLs are preserved, with HTTPS preferred. No automatic
  failover bypasses an active cooldown.
- WHOIS attempt metadata was adjusted at the actual lookup boundary so missing
  routes are not counted as network traffic. WHOIS parsing rules are unchanged.
- Node 22 initially reported too many abort listeners during fan-out. A shared
  cancellation listener per queued signal removed the warning; both supported
  Node versions were rerun successfully.

Commands below ran in this worktree unless a temporary script is specified.
Bun executable: `/tmp/temper-upgrade-audit-20260919/tools/bun-darwin-aarch64/bun`
(1.4.2). Node executables were the pinned 22.12.0 and 24.21.0 audit installations.

| Check | Result |
| --- | --- |
| `bun ci` | Passed, lockfile unchanged |
| Initial `bun test src/checker/{checker,limiter,rdap}.test.ts` | 40 passed, 108 assertions |
| Initial reliability regressions | 7 expected failures: only 11/21 dispatched; other host starved; Retry-After violated; rate-limit result lost; three invalid-200 cases |
| Added cache, elapsed/coverage, cancellation, metadata regressions | Failures reproduced before the respective corrections; cache validation and protocol cases also exercised |
| Final `bun test` | 203 passed, 0 failed, 549 assertions across 20 files |
| `bun run typecheck`, `bun run web:typecheck` | Passed |
| `bun run build:npm`, `bun run web:build` | Passed |
| `bun run src/index.ts --help` and `search --help` | Passed; automatic and explicit timeout help verified |
| MCP SDK stdio tests | Six tools and validation, cancellation while another request continues passed |
| Node 22.12 and 24.21 compiled CLI/MCP | Shared-server fixture: 59/59 answered automatically; explicit 3s budget preserves 59 rows and identifies unstarted rows; extended MCP summary/detail passed without listener warnings |
| `node tests/browser/playground.mjs` against local built Next server | Passed: 390/1440 page width, Escape/stale response, focus, incomplete stream, partial coverage/reason, registrar caveat |
| Next route tests | Row stream/summary and response-body cancellation passed with controlled endpoints |
| `git diff --check` | Passed |

Temporary evidence: `/tmp/temper-rdap-final-tests.log`,
`/tmp/temper-rdap-final-web-build.log`, `/tmp/temper-rdap-integration.log`,
`/tmp/temper-rdap-implementation-20260919/runtime-v22.12.0.json`,
`/tmp/temper-rdap-implementation-20260919/runtime-v24.21.0.json`.

Separate real-network verification (2026-09-19), compiled CLI on Node 24.21 with
an isolated temporary home, recorded in
`/tmp/temper-rdap-implementation-20260919/live.json`:
- `search temper-check-7e672b044f26 --extended --format json`: 59 results,
  53 RDAP + 6 WHOIS, one attempt each, all returned registration-not-found
  availability signals. CLI process wall time 7.127s.
- `search example --tlds com,net,org --format json`: 3/3 taken (1.048s).
- `whois example.com --format json`: taken, registrar/detail returned (0.522s).

These observations do not prove purchase availability, premium pricing, future
registry response times, hosted Production behavior or cross-instance rate
coordination. The hosted service and installed Homebrew binary were not updated.

## Subsequent local commit approval

The user subsequently approved splitting this implementation into three local
commits: bootstrap cache, lookup engine with required callers, and user-facing
results/options/documentation. This approval does not include merge, push,
release, publication or deployment.

Commit preparation verifies staged-only snapshots exported with
`git checkout-index`, so later unstaged changes cannot conceal a missing
prerequisite. The first snapshot passed 180 tests and the second passed 199;
both also passed root/web typechecks and the npm build. Per-snapshot source tree
IDs, commands, exit codes and logs are recorded under
`/tmp/temper-rdap-commit-verification/`. Product source is preserved unchanged
from the approved and verified implementation; only this execution record is
updated during commit preparation.
