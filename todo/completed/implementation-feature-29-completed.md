# Feature 29 — progress log

Cross-links: [todo-9.md](../todo-9.md) · [implementation](../implementation-feature-29.md).

This feature is **still open** — see the implementation file for what remains
(reward bosses/chests and per-monster death/loot callbacks). This log records
the sub-work that is finished.

---

## 2026-07-25 — Loot tables imported losslessly, rolled Canary-style, parity-gated

**Problem.** All 782 loot-bearing monster tables were already in the pinned
content, but the server threw information away on both sides of the roll: the
loader dropped `minCount` and Canary's `unique` flag, and the roll ignored
stackability (a non-stackable item could drop as a stack of four), ignored
`minCount` entirely, and silently skipped any entry naming an item the pinned
catalog does not carry. Nothing measured or gated the tables, so a re-import or
an item-catalog rebuild could quietly change what every monster drops.

**What changed.**

- **Lossless import.** `MonsterLoot` gained `minCount` and `unique`;
  `loadCreatureContent.parseLoot` reads both and bounds `minCount` by the
  entry's own `maxCount`, so a table that asks for more than it allows fails
  the load instead of being silently reinterpreted.
- **Canary roll semantics** extracted into the pure
  `server/src/combat/rollMonsterLoot.ts`: one roll per entry against
  `chance / MAX_LOOTCHANCE` scaled by the server's loot rate and capped at
  100%; a stackable drop takes a count inside `[minCount, maxCount]` clamped to
  the type's stack limit; a **non-stackable drop is always exactly one item**
  however wide the band (previously it could mint four swords); entries beyond
  the corpse's capacity do not fit. `createMonsterCorpse` is now just the
  world/corpse wiring around it, and entry→type resolution moved to
  `resolveMonsterLootType.ts` (id wins over name, no neighbouring-id fallback).
- **Aggregate parity gate.** `buildMonsterLootReport.ts` aggregates every table
  against the item catalog, and `monsterLootParity.test.ts` pins the result:
  782 loot-bearing monsters, 9 679 entries, 9 641 resolved, 2 441 counted
  bands, 3 `unique` entries, and a **pinned 38-entry / 12-item unresolved
  budget** (items that do not exist in the pinned Tibia 15.11 catalog:
  darklight/inferniarch-era drops). It also pins the monsters whose loot can
  never drop because their corpse is not a container (`lost-gnome` plus 21
  uncontainable corpses — Canary's `internalCreateCorpse` behaves the same) and
  the 144 tables longer than their corpse's capacity. Any drift in a table, a
  count band, a corpse container, or the unresolved budget fails the test.
- **Quick-loot eligibility.** `protocol/src/item.ts` gained
  `QUICK_LOOT_CATEGORIES` (Canary's `ObjectCategory` reduced to what this
  server distinguishes) plus a client-facing filter enum that excludes `none`;
  `server/src/item/quickLootCategory.ts` derives an item's bucket from
  structural catalog fields (slot, weapon type, worth, capacity, food) rather
  than the wiki's free-text `primaryType`. The parity test pins the two pinned
  drops that are not pickupable at all (`ice cube`, `wooden trash`), which is
  the same outcome Canary's move rules produce.

**Files touched.**

- `server/src/combat/rollMonsterLoot.ts`, `resolveMonsterLootType.ts`,
  `buildMonsterLootReport.ts` (all new)
- `server/src/combat/createMonsterCorpse.ts`,
  `server/src/creature/MonsterType.ts`,
  `server/src/spawn/loadCreatureContent.ts`
- `server/src/item/quickLootCategory.ts` (new), `protocol/src/item.ts`
- Tests: `monsterLootParity.test.ts` (new), `rollMonsterLoot.test.ts` (new),
  `createMonsterCorpse.test.ts`, `bestiary/BestiaryService.test.ts`

**Verification.** `yarn workspace server test` — 848 passed / 183 skipped, up
12 tests. The existing exactly-once death coverage in `Combat.test.ts` and the
restart-cannot-reroll-loot invariant in `ItemIntentHandler.decay.test.ts` both
still pass unchanged. `yarn workspace server typecheck` clean.

**Residual risk / still open.**

- **Child containers are not in the pinned content.** `primitiveRecord` in
  `tools/parseCanaryCreatureContent.mjs` keeps only string/number/boolean
  fields, so any nested `child` loot table in Canary's Lua is dropped at
  import. Fixing it means teaching the parser to recurse *and* re-running the
  import against the pinned Canary checkout (see the `canary-checkout-required`
  note), then extending `LootItemCreation`/`CorpseCreator` to nest.
- **`unique` is imported but not modelled.** Three boss entries (jaul,
  obujos, tanjis) carry it. Canary's exact semantics were not confirmed from
  source, so the roll deliberately ignores the flag rather than guessing; the
  test pins the count at 3 so a wider use cannot slip in.
- **Loot `subType`** (fluid/charge sub-values) is not imported.
- The runtime skips unresolved entries silently — the budget is enforced by
  the test, not by a boot-time throw, because a hard failure at boot would
  brick the server on catalog drift.
