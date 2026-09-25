# Lookup limits and troubleshooting

[Back to the README](../README.md) · [CLI reference](cli.md) · [MCP](mcp.md)

## Time budgets and partial results

General initial CLI/MCP searches choose a 5–30s budget based on the current server queue and shared spacing.
This is a client policy, not a promise that every registry will answer. An explicit
`search --timeout` sets a strict limit per query name, including bootstrap loading;
multi-name JSON searches apply it separately to each name, not to the entire invocation.
Each network request has up to 5s after dispatch, within the remaining total time;
detailed lookups retain a 10s total limit. Suggestions use 6s, watchlist checks 8s,
and the hosted demo 3s. Explicit TUI resume allows up to 120s; MCP resume uses 30s.

Results keep the existing status values and JSON array format. Optional
`attempts`, `queueTimeMs`, `terminationReason`, `retryAt`, and `retryAtSource` fields distinguish a
request that never started, a timeout, cancellation, and server rate limits.
RDAP `responseTime` includes queueing and retry waits; `queueTimeMs` isolates
the queue portion.
`httpStatus` preserves the observed HTTP status and `checkedAt` dates an actual
registration/not-found answer; a deferred request does not create new evidence.
MCP summaries separate requested, attempted, answered, and unresolved domains
and show actual elapsed time. A completed stream can contain unresolved results.
`available` means no registration record was found; confirm purchase availability,
premium pricing, and restrictions with a registrar.

Local CLI and MCP commands share server cooldowns in
`~/.temper/state/lookup-limits.json`. A server's `Retry-After`, including a
24-hour wait, survives command restarts. If no valid wait is provided, Temper
waits 60, 120, 240, 480, then 900 seconds after repeated limits, adding 0–5
seconds of jitter. These are client policy values, not registry quotas.
Repeating a search during the wait does not increase that backoff. After the
wait, a new user request enters gradual recovery; no background retry runs.
Recovery allows one request at a time. After a 429, spacing starts at 1200ms and
can increase to 2400/4800/9600ms after new limits. Each step back toward normal
requires eight consecutive valid answers and at least 30s of observation.
These conservative policy values are not measured registry quotas or a speed guarantee.

`terminationReason: "server_cooldown"` with `attempts: 0` means that domain was
not queried because of a previous server limit. `retryAt` is the earliest retry
time in UTC, not a promise of success; `retryAtSource` is `server` or
`client_policy`. TUI search, suggestion and detail views and MCP output explain
the wait. HTTP 503 remains a service error. Other servers can continue.

The state file contains server coordination metadata, not domain names or
response bodies. Commands using the same home coordinate at most two requests
per server and at least 300ms between admissions under normal conditions.
Waiting for shared admission does not hold a local network slot. A damaged, inaccessible or busy state file
returns `limit_state_error` instead of sending an uncoordinated request. Preserve
and repair a damaged file; do not delete it to bypass a wait. If a command dies
while holding the short file lock, first confirm no Temper processes are running,
then remove only `lookup-limits.json.lock`. Request leases otherwise expire or
are reclaimed after their process exits. Different homes, machines and hosted
web instances do not share this local state; the web demo uses memory only.

The shared state now uses version 2. Migration preserves existing waits and refuses
to proceed while a live version-1 request lease exists. Update older Temper
processes and reconnect MCP clients before using the new version together.
Older 0.5.2 processes reject version-2 state; do not delete the file to work around
that error. Automatic downgrade is not supported.


## Resume and cancellation

Use `r` to resume the selected retryable unresolved candidate, or `R` for those
in the current filtered list. Invalid input, unsupported routes, invalid responses and
damaged limit state require correction instead. Confirmation shows a maximum 120s budget.
Server waits still apply; candidates beyond the budget stay deferred. `Esc` stops
the resume while retaining prior results. Returning from history or another screen
preserves the current search in memory; exiting Temper ends that session. Resuming
updates its existing history entry without recreating a deleted entry.
Selecting a past history entry starts a new search using only its query, not its old options.

## Privacy and transport

CLI and local MCP lookups run on your machine and contact registry/RDAP/WHOIS providers.
Those providers receive the requested domain and connection metadata. Temper adds no telemetry.
History and watchlist are stored locally under `~/.temper`; the shared limit file contains server metadata, not domain names.
The hosted web demo sends the submitted name to its server-side API, which performs the lookup.
HTTPS RDAP verifies TLS certificates; HTTP routes and WHOIS do not encrypt queries.
Update checks contact npm or the Homebrew tap without sending domain names or history; the service can see connection metadata.

## Update and browser failures

A failed automatic update check reports briefly and continues the original command.
See [update installation rules](cli.md#updates) for supported installations and cancellation behavior.
A successful browser-opening request does not verify that a registrar page loaded or that a purchase is available.
If opening fails or cannot be confirmed, use the displayed URL manually.
