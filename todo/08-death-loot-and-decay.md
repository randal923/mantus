# Death, corpses, loot, and decay

Depends on [`combat`](07-combat.md) and atomic [`items`](05-items-and-inventory.md).
Deaths, loot rolls, corpse creation, and decay are server outcomes and must be
idempotent across races and restarts.

## Death transaction

- [ ] Give each life/death transition a stable id and ensure a creature changes
  alive to dead once even if multiple lethal events land in one tick.
- [ ] Stop AI/combat, remove occupancy, notify only visible observers, schedule
  its spawn slot, and create the correct corpse through one ordered handler.
- [ ] Roll monster loot once on the server. Create corpse/container items and
  contents atomically with audit entries for tracked value.
- [ ] Define kill attribution, experience sharing, loot ownership/protection,
  party rights, boss contribution, and timeout rules before exposing contents.
- [ ] Persist enough state that restart cannot reroll loot, duplicate a corpse,
  or lose an already committed rare.

## Player death

- [ ] Decide and document death penalties: temple position, health/mana restore,
  experience/skill loss, blessings, item/container loss, unfair-fight/PVP rules,
  and protection behavior.
- [ ] Apply penalties, item ownership changes, and audit events atomically before
  acknowledging the respawn/login state.
- [ ] Never let a reconnect or duplicate death packet skip or apply a penalty
  twice.

## Decay

- [ ] Add a bounded tick-owned `DecayManager`; timer callbacks may enqueue work
  but never directly mutate shared world state.
- [ ] Track transform/remove deadlines with server time and documented restart
  semantics. Corpse container access must close/reconcile when it transforms.
- [ ] Re-check item identity, version, and location at execution so moving an
  item cannot cause a stale decay job to destroy its replacement.

## Planned file surface

- `server/src/death/DeathHandler.ts`, `KillAttribution.ts`,
  `server/src/loot/LootTable.ts`, `rollLoot.ts`,
  `server/src/item/DecayManager.ts`, corpse/loot ownership protocol and UI.
- Persistence additions for life/death idempotency, decay deadlines where
  durable, corpse items, and audit records.

## Required exploit tests

- [ ] Concurrent lethal hits create one death, one corpse, one loot roll, and
  one experience award.
- [ ] Restart/retry cannot reroll or duplicate committed loot.
- [ ] Two players racing for protected loot produce one valid owner/move.
- [ ] A stale decay task cannot remove a moved/transformed/new item instance.
- [ ] Player death penalties are neither skipped nor applied twice on reconnect.
- [ ] Corpse/loot packets are visibility- and permission-filtered.

[Back to overview](README.md)
