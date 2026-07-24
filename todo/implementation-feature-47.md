# Feature 47 — Depot/market transaction hardening

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

## Why
Depot/inbox shipped with a memory-authoritative online lane and all exploit tests, but several accepted trade-offs were recorded, and one of them — the missing 40001 serialization-retry — affects both the depot/mail lane and the market lane and causes spurious user-visible failures.

## Remaining work
Recorded persistence-lane trade-offs and their fixes:
- `server/src/depot/runSerializableTransaction.ts` does not retry serialization failures (Postgres 40001) — mail/expiry racing a persist can spuriously fail (`mail-action-failed: failed`) or trigger the disconnect path. Fix: bounded 40001 retry loop; the carried-item lane (`ItemIntentHandler.enqueuePersist`) already retries 3x since 2026-07-21, the depot/mail lane does not. The identical gap exists in the market lane via `MarketTxHelper.ts` — one shared fix closes both.
- Persist failure currently poisons the character's persist queue and disconnects the player. Fix if visible: live resync — reload inventory + depot caches in place instead of disconnecting.
- Depot mutations (same-owner deposit/withdraw/stash) are acknowledged before DB commit; a crash between memory-apply and persist loses that mutation (no dupe possible; memory is rebuilt from DB at login). Accepted for latency. Cross-character flows (mail, reward, expiry) stay commit-first — keep this split.
- Expiry returns race an online recipient's withdraw for ~1 tick (harmless at 30-day granularity) — documented, no action needed.
- Mid-login deliveries buffer up to 60 s in `DepotCacheManager` between `beginLoad` and `attach` (idempotent id-keyed replay); an aborted login relies on TTL expiry — documented, no action needed.

## Implementation
- Highest-value first: add a bounded 40001 retry loop (~3 attempts, mirroring the `ItemIntentHandler` lane) to `server/src/depot/runSerializableTransaction.ts`, and apply the same fix to the `server/src/economy/` copy and the market path through `server/src/market/MarketTxHelper.ts`. Retries re-run the whole transaction, so validation stays at execution time and the one-transaction ledger + `audit_log` coupling is preserved.
- Live resync: replace the disconnect path in `server/src/depot/DepotPersistOps.ts` / `DepotCacheManager.ts` with an in-place reload via `DepotLoadOps.ts`, rebuilding the memory caches from committed DB state so no dupe or loss is possible.

## Tests
- Injected 40001 on first attempt succeeds on retry with a single net commit (extend `PgDepotStore.integration.test.ts` / `DepotCacheManager.test.ts`); same for the market lane.
- Poisoned-queue path resyncs without item loss or duplication.
- Cross-character flows remain commit-first after the changes (mail delivery acknowledged only after commit).

## Dependencies
- None hard; shares the retry pattern with the shipped `ItemIntentHandler.enqueuePersist` lane. Benefits Features 48 and 49 (their mail/market flows ride these lanes).
