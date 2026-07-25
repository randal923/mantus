# Todo 6 — Death, loot, and decay

**Features 29, 32, 33.** Shipped end to end: exactly-once deaths,
server-rolled atomic loot with the 782-monster parity gate, memory-first
corpses with nested browsing and the quick-loot sweep, the full Canary
XP/skill-loss formula with the unfair-fight reduction, carried/equipped decay
with durable deadlines, and the shared serializable-retry helper (see
[done.md](done.md)).

## Feature 29 — Monster loot-table parity import (remainder)

Lossless import (`minCount`/`unique`), Canary roll semantics (stackable count
bands clamped to stack limit, one non-stackable per entry, rate-scaled
chance, corpse capacity), entry→type resolution, quick-loot buckets, and the
aggregate gate over all 782 loot-bearing monsters shipped.

**Remaining work**

- **Child loot containers** (bags inside a corpse). Not a runtime gap yet —
  the importer's `primitiveRecord` drops nested `child` tables, so pinned
  content carries none. Needs: parser recursion, a re-import against the
  pinned checkout, and nesting support in `LootItemCreation` /
  `CorpseCreator`.
- **`unique` loot flag** (3 pinned boss entries) — imported but not
  modelled; confirm exact semantics from Canary source.
- **Loot `subType`** (fluid/charge sub-values) — not imported.
- **Reward-boss / reward-chest rules** — with Features 76/84 (todo-10).
- **Special death/loot callbacks per monster** — the 175
  `08-death-loot-and-decay` callbacks in
  `content/canary-parity-inventory.json` are still `blocked`.
- The **38-entry unresolved budget** is pinned by `monsterLootParity.test.ts`
  but the items are missing from the pinned 15.11 catalog — a newer asset
  era, not code, closes it.

**Implementation:** roll in `server/src/combat/rollMonsterLoot.ts` (pure,
server-RNG injected) wired by `server/src/combat/createMonsterCorpse.ts`
inside the death tick; corpse items created atomically with `item-created`
audits via `ItemStore.createCorpse`. Parity in
`server/src/combat/buildMonsterLootReport.ts` + `monsterLootParity.test.ts`.
The planned `server/src/loot/`/`server/src/death/` extraction stays deferred
until kill attribution grows party rules.

**Tests:** aggregate parity fails on any missing entry/condition/count/
chance/child container/callback; concurrent lethal hits still one death/
corpse/roll; restart cannot reroll or duplicate committed loot.

## Feature 32 — Full Canary player-death penalty parity (remainder)

The full loss formula as typed data (level curve, promotion, blessing and
unfair-fight discounts), skill/magic-level loss from the same death event,
and the live-damage unfair-fight reduction shipped.

**Remaining work**

- **Blessings** — the formula seam (`Player.blessings`) reads 0 until
  Feature 72 (todo-10) ships persistence/purchase; consumption then happens
  inside the death transaction (checked at execution time in the tick).
- **Item/container loss into a player corpse**, governed by blessing state —
  one new atomic item operation: equipment + backpack into a fresh player
  corpse inside the penalty's transaction, with audits (charter rules 2/11),
  via the memory-first machinery (`server/src/item/CorpseCreator.ts`,
  `ownerCharacterId` stamping). Includes the amulet-of-loss and
  red/black-skull branches from `Blessings.PlayerDeath`.
- Coordinate with Feature 59 (todo-9): the lingering combat-logout entity
  must keep its inventory attached once corpses drop items.

**Implementation:** extend the player branch of `Combat.handleDeath`
(`server/src/combat/Combat.ts` / `DeathHandler.ts`),
`Player.applyDeathPenalty`, `CharacterProgression.loseExperience`; penalty
rules stay typed data. Blessing purchases intersect NPC dialogue (typed
commands from Features 38/40) and the shipped bank.

**Tests:** exactly-once item drop under concurrent lethal hits; blessing
consumed atomically with the penalty (no path where one applies without the
other); no dupe on reconnect (persisted `death:{uuid}` replay guard); the
existing neither-skipped-nor-doubled invariant extended to the full stack.

## Feature 33 — Field-item decay and charge expiry

Carried/equipped decay shipped (burning rings, perishables, logout-safe
deadlines, pause-from-data).

**Remaining work**

- **Spell-created fields as real world items** with full lifecycle —
  `CombatFieldManager` keeps fields as in-memory combat state with no world
  item, so nothing renders or decays on the ground. Touches combat, world
  items, and visibility together; coordinates with Feature 24's field runes
  (todo-5), which need the same creation path.
- **Charge-based expiry** — 125 catalog types carry `charges`; nothing
  spends one yet.
- **Special decay callbacks.**

**Implementation:** extend `server/src/item/DecayManager.ts` and
`ItemIntentHandler.ts`; carried deadlines key to owner inventory via
`InventoryCache`/`CarriedPersistPlan` (perf-pass invariant: `InventoryCache`
is immutable — transforms go through the mutation path). Fields register
decay via the same stale-guard pattern (identity/version/location re-checked
at execution, in-memory and in the version-checked transaction). Keep the
timer-enqueues/tick-applies model; audits stay `item-transformed` /
`item-destroyed` reason `decay` (`PgDecayOps.ts`).

**Tests:** equip-state transform races (de-equip mid-decay never runs the
equipped transform; re-equip re-arms); field lifecycle transforms/expires
exactly once; charge exhaustion fires once under concurrent uses; existing
stale-decay invariants keep holding.

[Back to overview](README.md)
