# Lookup recovery implementation plan

Goal: preserve lookup evidence and let users explicitly resume unresolved candidates without bypassing shared waits.

Design approved on 2026-09-25. The technical requirements and validation scope are recorded below; see [current implementation notes](../../current.md) for the maintained behavior reference.

Architecture: a non-sleeping shared admission transaction feeds the local scheduler. Checker resume runs stop queued work for a newly limited server. A memory-owned TUI session merges results by run epoch; MCP returns bounded structured results and a manual retry plan. No new dependencies, cache, provider API or persisted domain list.

## 1. Evidence and output

- [x] Add regressions in WHOIS and MCP formatter tests for legal-notice/denial/conflicting-evidence responses and missing selected-TLD wait metadata. Run them before changing behavior.
- [x] Update `src/checker/whois.ts` only for explicitly covered generic denial forms; preserve unknown/conflicting responses as errors. Do not invent provider patterns.
- [x] Add typed `httpStatus`/`checkedAt` metadata where actual response/evidence exists; preserve status/confidence and CLI JSON array/filter semantics.

## 2. Shared admission and recovery

- [x] Test v1 migration preserving waits, active-old-lease refusal, invalid state preservation, generation races, zero/long server waits, gradual recovery and ready-server fairness.
- [x] In `limits.ts`/`limit-store.ts`, introduce validated v2 state and `tryAcquire(key, deadline, signal)` returning a permit or finite retry delay. Reserve nextStart and lease atomically only on admission; `permit.check()` validates without sleeping. Keep `acquire()` as a waiting compatibility helper for direct callers/tests.
- [x] In `admission.ts`, requeue denied admission after the existing scheduler returns its local slot. Successful admission retains the slot through transport and releases the lease in finally; `scheduler.ts` itself needed no change.
- [x] Recovery policy: normal300ms/2, first429 at1200ms/1; steps300/600/1200/2400/4800/9600ms,8 consecutive answers and30s observation to relax one step.503 does not learn a faster/slower429 rate. Preserve fallback waits and unlimited valid Retry-After.
- [x] Add `resume` to checker options/context, disable its internal limited-response retry and stop not-yet-started work on affected servers. Other servers continue; retryAt beyond deadline returns immediately. Existing initial-search timeout option remains unchanged.

## 3. Session, history and UI

- [x] Test a production memory session with a controlled checker iterator: completed rows survive, resume selects only known unresolved domains, repeated starts fail, cancel rejects late results, cumulative attempts persist, all-deferred returns without idle wait.
- [x] Extract session ownership above screen transitions (`App.tsx`); hook subscribes/unsubscribes and cancels work on leaving while preserving snapshot. Past-history searches use a separate session.
- [x] Add selection/confirmation with count and120s maximum, separate current-round progress, Esc stop, q/Ctrl+C exit, unresolved filter and explicit registrar confirmation action. Never query to read an already-present failure reason.
- [x] Add compare-and-replace history update under the existing file lock; preserve timestamp, do not resurrect deleted/ambiguous entries, append only once after an actual attempt.
- [x] Exercise actual TUI rendering/keys and navigation, not only model behavior.

## 4. MCP and integration

- [x] Add shared lookup output schema/result builder with schemaVersion1,rows,summary,retryPlan, human text and JSON text. Test actual SDK/stdio tool result validation and existing consumers.
- [x] Allow explicit `resume` on the existing full-domain tool for exact prior unresolved candidates; max100 stays explicit, no silent truncation of480-result searches. Apply a server-owned30s lookup budget; no progress-based lifetime guarantee or background retry.
- [x] Align README/current docs and relevant web MCP guidance. Hosted Web remains3s/max20TLD and memory-only state. Add no Codex-specific setup change.
- [x] Run root tests/typecheck, npm build, local TLS/limits runners; Web typecheck/render checks if affected. Refresh checker evidence metadata only as recheck-required, never as fresh registry observations. Verify catalog/docs and inspect all final changes.

## Validation boundary

Tests use temporary homes, mocked transports or loopback servers. No live registry, hosted environment, user installation or production state validation is authorized. Keep failures and unverified boundaries in the agent todo. Existing valid results may be reused until relevant files/conditions change.
