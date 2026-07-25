# Feature 29 — Monster loot-table parity import

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

## Why
Loot is rolled once server-side and committed atomically, but only a baseline of tables exists. Canary parity requires importing and matching every pinned monster loot table plus corpse and death behaviors, gated by an aggregate test so drift fails loudly.

**Shipped 2026-07-25** (see
[completed/implementation-feature-29-completed.md](completed/implementation-feature-29-completed.md)):
lossless import of `minCount`/`unique`, Canary roll semantics (stackable count
bands clamped to the stack limit, exactly one non-stackable item per entry,
rate-scaled chance, corpse capacity), entry→type resolution, quick-loot
eligibility buckets, and the aggregate parity gate over all 782 loot-bearing
monsters with a pinned unresolved budget.

## Remaining work
- Child loot containers (bags inside a corpse). Not a runtime gap yet: the
  importer's `primitiveRecord` drops nested `child` tables, so the pinned
  content carries none. Needs the parser to recurse, a re-import against the
  pinned Canary checkout, and nesting support in `LootItemCreation` /
  `CorpseCreator`.
- Canary's `unique` loot flag (3 pinned boss entries) is imported but not
  modelled — its exact semantics still need confirming from Canary source.
- Loot `subType` (fluid/charge sub-values) is not imported.
- Reward-boss / reward-chest rules.
- Special death/loot callbacks per monster (the 175 `08-death-loot-and-decay`
  callbacks in `content/canary-parity-inventory.json` are still `blocked`).
- The 38-entry unresolved budget is pinned by the test but the items
  themselves are missing from the pinned Tibia 15.11 catalog; closing it needs
  a newer asset era, not a code change.

## Implementation
- Roll: `server/src/combat/rollMonsterLoot.ts` (pure, server-RNG injected),
  wired by `server/src/combat/createMonsterCorpse.ts` inside the death tick;
  corpse/container items are still created atomically with `item-created`
  audits via `ItemStore.createCorpse` in a single transaction.
- Parity: `server/src/combat/buildMonsterLootReport.ts` +
  `monsterLootParity.test.ts`, modeled on
  `server/src/combat/loadCanarySpellCatalog.test.ts`.
- The planned `server/src/loot/` and `server/src/death/` extraction still does
  not exist and is still deferred until kill attribution grows party rules.

## Tests
- Aggregate parity test over every loot-bearing monster failing on any missing entry/condition/count/chance/child container/death callback.
- Regression: concurrent lethal hits still produce exactly one death, one corpse, one loot roll (existing `Combat.test.ts` coverage must keep passing with imported tables).
- Restart cannot reroll or duplicate committed loot (existing `ItemIntentHandler.decay.test.ts` invariant).

## Dependencies
- Bestiary (exists; fixes tracked as Feature 77).
- Parties for boss contribution / party loot rights — Features 55–57 (party shipped; kill-attribution party rules deferred until then).
