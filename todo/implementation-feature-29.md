# Feature 29 — Monster loot-table parity import

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

## Why
Loot is rolled once server-side and committed atomically, but only a baseline of tables exists. Canary parity requires importing and matching every pinned monster loot table plus corpse and death behaviors, gated by an aggregate test so drift fails loudly.

## Remaining work
- Import/match every pinned Canary monster loot table.
- Corpse id and container behavior per monster.
- Reward-boss / reward-chest rules.
- Quick-loot eligibility flags.
- Bestiary/bosstiary kill updates on death.
- Special death/loot callbacks per monster.
- Aggregate parity tests over every loot-bearing monster that fail when an entry, condition, count, chance, child container, or death callback is missing.

## Implementation
- Extend the loot roll in `server/src/combat/Combat.ts` / `server/src/combat/DeathHandler.ts` and corpse creation in `server/src/item/CorpseCreator.ts`. Note the planned surface (`server/src/death/DeathHandler.ts`, `KillAttribution.ts`, `server/src/loot/LootTable.ts`, `rollLoot.ts`) does not exist yet — those directories are a deferred extraction; do it when kill attribution grows party rules, not before.
- Loot content follows the pinned-content pattern already proven for spells (`content/spells/canary-spells.json` + `tools/parseCanarySpells.mjs`): a static parser over Canary monster Lua (opentibiabr/canary) producing typed JSON plus an import report, loaded fail-closed on mismatch.
- All rolls stay server-side RNG inside the death handler on the tick (charter: combat/spells server rolls all RNG); corpse/container items created atomically with `item-created` audits via `ItemStore.createCorpse` in a single transaction, as today.
- Aggregate parity test modeled on `server/src/combat/loadCanarySpellCatalog.test.ts`.

## Tests
- Aggregate parity test over every loot-bearing monster failing on any missing entry/condition/count/chance/child container/death callback.
- Regression: concurrent lethal hits still produce exactly one death, one corpse, one loot roll (existing `Combat.test.ts` coverage must keep passing with imported tables).
- Restart cannot reroll or duplicate committed loot (existing `ItemIntentHandler.decay.test.ts` invariant).

## Dependencies
- Bestiary (exists; fixes tracked as Feature 77).
- Parties for boss contribution / party loot rights — Features 55–57 (party shipped; kill-attribution party rules deferred until then).
