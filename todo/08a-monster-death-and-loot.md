# Monster death, corpses, and loot

Part of [`08-death-loot-and-decay`](08-death-loot-and-decay.md). Depends on
[`combat`](07-combat.md) and atomic [`items`](05-items-and-inventory.md).
Deaths, loot rolls, and corpse creation are server outcomes and must be
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

## Planned file surface

- `server/src/death/DeathHandler.ts`, `KillAttribution.ts`,
  `server/src/loot/LootTable.ts`, `rollLoot.ts`, and corpse/loot ownership
  protocol and UI.
- Persistence additions for life/death idempotency, corpse items, and audit
  records.

## Required exploit tests

- [ ] Concurrent lethal hits create one death, one corpse, one loot roll, and
  one experience award.
- [ ] Restart/retry cannot reroll or duplicate committed loot.
- [ ] Two players racing for protected loot produce one valid owner/move.
- [ ] Corpse/loot packets are visibility- and permission-filtered.

[Back to overview](README.md)
