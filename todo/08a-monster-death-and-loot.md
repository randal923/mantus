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
  [`13-social-and-houses`](13-social-and-houses.md)).
- [x] Persist enough state that restart cannot reroll loot, duplicate a corpse,
  or lose an already committed rare. The roll and the corpse commit happen once
  per in-memory death; monsters are not persisted, so after a restart a prior
  death either fully committed its corpse (reloaded via world deltas) or never
  happened. There is no replayable path back into `handleDeath`.
- [ ] Import and match every pinned monster loot table, corpse id/container
  behavior, reward-boss/reward-chest rule, quick-loot eligibility, bestiary/
  bosstiary kill update, and special death/loot callback.
- [ ] Expose corpse contents to players: an open-corpse protocol message,
  distance/visibility checks, a loot-take item path that enforces
  `ownerCharacterId` protection until it expires, and the client loot UI.
  Contents exist in the store today but are not reachable by any client
  intent.

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
- [ ] Two players racing for protected loot produce one valid owner/move
  (blocked on the loot-take path above).
- [x] Corpse/loot packets are visibility- and permission-filtered. Corpse tile
  updates go only to sessions that can see the tile (`Visibility`
  `tile-states`); corpse contents are never sent to any client today.
- [ ] Aggregate parity tests cover every loot-bearing monster and fail when an
  imported loot entry, condition, count/chance, child container, or death
  callback is missing.

[Back to overview](README.md)
