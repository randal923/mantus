# Feature 33 — Carried/equipped and field-item decay

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

## Why
Decay is complete only for ground (world) items — transform chains, capacity-shrinking stages, audited removal all shipped. Parity requires decay for inventory/equipment items and spell-created fields, plus charge-based expiry.

## Remaining work
- `transformEquipTo` / `transformDeEquipTo` chains — rings/amulets activating on equip and reverting on de-equip.
- Field items created by spells, with their full lifecycle.
- Charge-based expiry.
- Stop conditions (decay pauses).
- Special decay callbacks.

## Implementation
- Extend `server/src/item/DecayManager.ts` and `server/src/item/ItemIntentHandler.ts` to track carried-item deadlines keyed to owner inventory, interacting with `InventoryCache` / `CarriedPersistPlan` (note the perf-pass invariant: `InventoryCache` is treated as immutable — decay transforms must go through the mutation path, not mutate cached entries).
- Equip/de-equip hooks live in the equipment mutation path, with `server/src/item/PgEquipmentOps.ts` for persistence.
- Field items intersect `server/src/combat/CombatFieldManager.ts` — spell-created fields register decay there or via DecayManager, using the same stale-guard pattern (identity/version/location re-checked at execution, in-memory and in the version-checked store transaction).
- Keep the timer-enqueues, tick-applies model (charter rule 5: never mutate game state from a timer callback) — `tickDecay` collects a bounded batch per tick and applies via the outcome queue, exactly as ground decay does today.
- Audits: transforms/destructions keep `item-transformed` / `item-destroyed` reason `decay` as in `PgDecayOps.ts`.

## Tests
- Equip-state transform races: de-equip mid-decay must not run the equipped-state transform, and re-equip must re-arm correctly.
- Field decay lifecycle (spell creates field, field transforms/expires exactly once).
- Charge exhaustion fires exactly once under concurrent uses.
- Existing stale-decay invariants keep holding: a stale task cannot remove a moved/transformed/new instance; restart reschedules and transforms exactly once.

## Dependencies
- Combat field system (shipped in todo-8 work; remaining area logic is Feature 25).
- Equipment slots (shipped).
