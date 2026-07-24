# Feature 97 — Server error handling

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
Gaps audited 2026-07-15, nothing landed since: a tick exception currently escapes the interval callback, protocol strikes and rate-limit disconnects are silent, there are no typed error categories, no dependency deadlines, and no defined behavior for ambiguous DB commits. This protects the live game and should land among the earliest todo-18 features.

## Remaining work

### Tick and process fatal-failure policy
- Top-level tick failure policy: record failing phase/tick, stop accepting work, terminate for supervisor restart; never keep ticking or blindly persist mid-tick state.
- Deliberate `unhandledRejection`/`uncaughtException` reporting that treats the process as unsafe: bounded cleanup, then exit; fatal reporting must not recurse or hang.

### WebSocket error/send hardening + silent-failure visibility
- Handle WS server and per-socket `error` events, close codes, send-callback failures, serialization failures, `bufferedAmount` limits; queue disconnect cleanup through the tick; stable close/error categories.
- Report protocol parse/schema strikes, rate-limit disconnects, full intent queues, heartbeat timeouts, and admission rejections through bounded counters plus sampled logs (all currently silent).

### Typed error categories + dependency deadlines/retry discipline
- Typed internal categories: validation, authorization, conflict, dependency unavailable, timeout, retry exhausted, invariant violation, fatal corruption risk.
- Auth/DB outages must not be misclassified as bad player credentials.
- Deadlines/cancellation around token verification, DB acquire/query/transaction, shutdown flushes; centrally classified retryability; capped jittered retries or circuit breaker only where replay is safe.
- Preserve the primary error plus cause when cleanup also fails; detect and classify ambiguous DB commit outcomes; never blindly retry a non-idempotent economy operation with an unknown commit result.

### Recoverable character-save failure handling
- Export queue depth, oldest age, and failure cause; fail health checks and alert; retain the latest dirty snapshot; a tested retry/reload or controlled-disconnect path.

### Startup configuration/content validation
- Validate every env/config value and required content at startup, including numeric bounds and DB schema/content compatibility; fail with one structured fatal event, never a partially initialized world.

## Implementation
- Wrap the tick callback in `server/src/TickLoop.ts` with a phase-tagged try/catch that flips a fatal latch consulted by admission (`GameServer.ts`) and triggers exit; process handlers in `index.ts`. Structured fatal event via Feature 94's logger with a hard flush deadline.
- `Session.ts` owns the socket — add error handlers, send-callback checks, a `bufferedAmount` cap; server-level error handler in `GameServer.ts`. Disconnect cleanup goes through the per-tick queue (charter rule 5). Counters feed Feature 95.
- New `server/src/errors/` module; apply at dependency edges: `SupabaseTokenVerifier.ts` (deadline; outage ≠ bad credentials), `PgAccountStore.ts` plus pool config (statement/acquire timeouts), transaction helpers. The 40001-retry classification belongs here — it is the same open question tracked in Feature 31 (corpse 40001 retry) and Feature 47 (depot/market transaction hardening).
- Ambiguous commit handling: connection loss during COMMIT = unknown outcome; verify via an `audit_log` idempotency key before any retry.
- Save-failure handling hooks into the dirty-flag save path in `server/src/character/` persistence; metrics feed Feature 95; the retained-snapshot rule interacts with Feature 98's drain deadline.
- Startup validation: extend `server/src/index.ts` (which already validates e.g. `PG_POOL_MAX`, lines 34–49) and `config.ts` to full coverage, plus a migration-version/content-manifest check against the DB before opening the listener.

## Tests
- Tick-exception test: fatal latch flips, admission stops, process exits; no continued ticking or blind mid-tick persistence.
- `unhandledRejection`/`uncaughtException` paths: bounded cleanup then exit; fatal reporting cannot recurse or hang.
- WS error/send/serialization failures and `bufferedAmount` breaches produce stable categories and tick-queued cleanup.
- Dependency-outage classification (Supabase/DB down ≠ bad credentials); deadline/retry/circuit-breaker behavior; ambiguous-commit verification before retry.
- Save-failure retry/reload or controlled-disconnect path.
- Startup fails fast with one structured fatal event on invalid config/content.

## Dependencies
- Feature 94 (structured fatal events), Feature 95 (counters, save alerting), Feature 98 (drain deadline shares machinery).
- Retryability classification cross-references Features 31 and 47.
- Feature 93's transport work overlaps the `Session.ts`/`GameServer.ts` WS changes — coordinate.
