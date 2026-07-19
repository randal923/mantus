# Monster death, corpses, and loot

Part of [`08-death-loot-and-decay`](08-death-loot-and-decay.md). Depends on
[`combat`](07-combat.md) and atomic [`items`](05-items-and-inventory.md).
Deaths, loot rolls, and corpse creation are server outcomes and must be
idempotent across races and restarts.

## Death transaction

- [x] Give each life/death transition a stable id and ensure a creature changes
  alive to dead once even if multiple lethal events land in one tick.
  `Creature.claimDeath()` guards the transition; each death mints a unique
  `death:{uuid}` event id (monster instance ids repeat across respawns and
  restarts, so they cannot key persisted progression events).
- [x] Stop AI/combat, remove occupancy, notify only visible observers, schedule
  its spawn slot, and create the correct corpse through one ordered handler
  (`Combat.handleDeath`).
- [x] Roll monster loot once on the server. Create corpse/container items and
  contents atomically with audit entries for tracked value
  (`ItemStore.createCorpse`, single transaction, `item-created` audits).
- [x] Define kill attribution, experience sharing, loot ownership/protection,
  boss contribution, and timeout rules before exposing contents. Pinned v1
  rules: the kill is attributed to the direct source player, else the top
  damager; that killer receives 100% of the experience; the corpse is stamped
  with `attributes.ownerCharacterId` and ownership expires when the corpse
  first decays (the attribute is cleared on the first decay transform). Party
  rights and boss contribution are deferred until parties exist (see
  [`14-social-and-houses`](14-social-and-houses.md)).
- [x] Persist enough state that restart cannot reroll loot, duplicate a corpse,
  or lose an already committed rare. The roll and the corpse commit happen once
  per in-memory death; monsters are not persisted, so after a restart a prior
  death either fully committed its corpse (reloaded via world deltas) or never
  happened. There is no replayable path back into `handleDeath`.
- [ ] Import and match every pinned monster loot table, corpse id/container
  behavior, reward-boss/reward-chest rule, quick-loot eligibility, bestiary/
  bosstiary kill update, and special death/loot callback.
- [x] Expose corpse contents to players. `use-map` (right-click) on a tile
  holding a materialized world container opens a per-session view
  (`WorldContainerViews`), reach-checked and re-validated every tick;
  contents go out as `world-container-state` and viewers are reconciled on
  any mutation (loot, decay, another player). The `loot-item` intent moves a
  direct child into the carried inventory (`planLoot`): memory-first atomic
  mutation, expected-version guard, `ownerCharacterId` protection re-checked
  at execution, transfer/merge audits in the same persist transaction. The
  client renders the corpse as a loot section in the inventory panel
  (drag-out or right-click to take; drops into the corpse are not allowed).
  Deferred (v1 scope):
  - nested world containers open only by taking the whole bag; browsing a
    bag inside a corpse in place is not supported,
  - pristine seeded map chests (never-materialized world items) are not
    openable via use-map,
  - one open world container per session (opening another closes the first),
  - no quick-loot / loot-all affordance.

## Planned file surface

- `server/src/death/DeathHandler.ts`, `KillAttribution.ts`,
  `server/src/loot/LootTable.ts`, `rollLoot.ts`, and corpse/loot ownership
  protocol and UI. (Current implementation lives in `Combat.handleDeath` /
  `createMonsterCorpse`; extract when kill attribution grows party rules.)
- Persistence additions for life/death idempotency, corpse items, and audit
  records.

## Required exploit tests

- [x] Concurrent lethal hits create one death, one corpse, one loot roll, and
  one experience award (`Combat.test.ts` death-path tests).
- [x] Restart/retry cannot reroll or duplicate committed loot (single
  transaction by design; boot-time rescheduling covered in
  `ItemIntentHandler.decay.test.ts`).
- [x] Two players racing for protected loot produce one valid owner/move
  (`ItemIntentHandler.loot.test.ts`: race leaves exactly one item in one
  backpack; stale-revision replays, out-of-reach opens/takes, and non-owner
  opens/takes are rejected).
- [x] Corpse/loot packets are visibility- and permission-filtered. Corpse tile
  updates go only to sessions that can see the tile (`Visibility`
  `tile-states`); corpse contents are sent only to adjacent viewers who pass
  the loot-protection check, and views auto-close on walk-away.
- [ ] Aggregate parity tests cover every loot-bearing monster and fail when an
  imported loot entry, condition, count/chance, child container, or death
  callback is missing.

## Known gaps (2026-07-19, memory-first corpses)

Corpse creation is now memory-only on the death tick (Canary-style): no DB
transaction at kill time. Rows plus `item-created` audits are inserted by the
first plan that touches the corpse or its loot
(`appendUnpersistedLootInserts`); decay of untouched corpses runs purely in
memory (`WorldItemDecayRunner.decayInMemory`). Accepted limitations and
follow-ups:

- Untouched corpses and their loot vanish on server restart. This is the
  intended volatility (matches Canary/real Tibia); anything a player has
  moved or looted is durable from that first touch.
- Invariant the plans rely on: unpersisted world items are only corpse roots
  and loot still inside them — no op today leaves an unpersisted stackable
  loose on the ground or moves a persisted item into an unpersisted
  container. If a future feature breaks that, `planDrop` /
  `findWorldMergeTarget` and the container planners need the same loot-origin
  handling as `planLoot`/`planPickup`/`planMoveMapItem`; a guarded write or
  delete that misses poisons the persist chain and disconnects the player.
- ~~`withSerializableTransaction` does not retry SQLSTATE 40001~~ Fixed
  2026-07-19: 5-attempt retry with growing backoff on
  `isTransientDatabaseError`. The live collision is item persists locking
  the character row (`lockCharacterQuery`) while character saves update it —
  and kill-time experience awards call `persistence.saveNow` on EVERY kill
  (`ProgressionSystem.persistAward`), so combat produces bursts of
  back-to-back saves that defeated zero-backoff retries. Regression tests:
  `withSerializableTransaction.test.ts` plus the "retries a persist that
  collides" and "survives a kill-time burst" integration tests. The
  character FOR UPDATE lock must stay — it is the per-character lock-order
  convention that keeps persists deadlock-free against trade/consume/depot
  flows. If bursts ever outlast 5 attempts, consider debouncing
  `persistAward`'s saveNow (the exactly-once guard only needs the event
  durable before the NEXT award, not instantly). Economy/depot/market/trade
  transaction helpers still do not retry; guild does.
- `PgItemStore.integration.test.ts` replays a hand-maintained migration list
  and drifts silently when new migrations land (023 was missing until
  2026-07-19). Consider replaying every file in `db/migrations/` instead.

[Back to overview](README.md)
