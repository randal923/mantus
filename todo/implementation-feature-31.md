# Feature 31 — Corpse persistence invariants and retry hardening

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

## Why
The 2026-07-19 memory-first corpse redesign (no DB rows until first touch, `appendUnpersistedLootInserts`, in-memory decay via `WorldItemDecayRunner.decayInMemory`) shipped with accepted limitations and one fragile invariant that future features can silently break, poisoning the persist chain.

## Remaining work
- Accepted limitation (intended, matches Canary): untouched corpses/loot vanish on restart. Keep this explicit.
- Fragile invariant to guard: unpersisted world items are only corpse roots and loot still inside them. If a future feature lets an unpersisted stackable end up loose on the ground, or a persisted item move into an unpersisted container, then `planDrop`/`findWorldMergeTarget` and the container planners need the same loot-origin handling as `planLoot`/`planPickup`/`planMoveMapItem` — a missed guarded write/delete poisons the persist chain and disconnects the player.
- If kill-time save bursts outlast the 5-attempt SQLSTATE 40001 retry (`withSerializableTransaction`, 2026-07-19 fix), debounce `ProgressionSystem.persistAward`'s `persistence.saveNow` — the exactly-once guard only needs the event durable before the NEXT award. Keep the character FOR UPDATE lock (`lockCharacterQuery`); its lock-order convention is what keeps persists deadlock-free versus trade/consume/depot.
- Economy/depot/market/trade transaction helpers still do not retry transient errors (guild does).
- `server/src/item/PgItemStore.integration.test.ts` replays a hand-maintained migration list and drifts silently when new migrations land; switch to replaying every file in `server/db/migrations/`.

## Implementation
- Apply the `withSerializableTransaction` retry pattern (`server/src/item/withSerializableTransaction.ts`: 5 attempts, growing backoff, `isTransientDatabaseError`) to the economy/depot/market/trade transaction helpers.
- Change `server/src/item/PgItemStore.integration.test.ts` to `readdir` the `server/db/migrations/` directory instead of a hardcoded list.
- Add an assertion (or regression test) that no item plan leaves an unpersisted item outside a corpse subtree — cheap insurance for the invariant above.
- Optional: `persistAward` debounce only if 40001 exhaustion is observed under kill bursts; do not add the complexity preemptively.

## Tests
- Regression test asserting no plan produces an unpersisted item outside a corpse subtree (drop, merge, container-move planners).
- Retry-pattern tests for each economy helper mirroring `withSerializableTransaction`'s existing tests.
- Integration test proves a newly added migration file is picked up automatically.

## Dependencies
- Feature 47 (depot/market transaction hardening) overlaps the economy-helper retry work — coordinate so it lands once.
- Feature 30 (materialize-on-open) expands the unpersisted-item surface this feature guards.
