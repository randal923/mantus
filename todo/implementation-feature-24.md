# Feature 24 — Remaining player support-spell callbacks

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

After conjuring, ammunition/enchantment, cure/dispel, light, inventory-food, and floor-moving spells became executable, an unfinished slice of pinned player spell registrations remains. Closing it feeds the zero-disabled spell gate (Feature 26).

## Remaining work

- Explicit gaps: random food-creation spell, creature illusion, challenge/taunt, player-facing summons and chains, Monk harmony, focus/virtue, and the remaining player-spell callbacks.
- Delegated branches: house spells → Todo 15 (Features 61–64); find-person/find-fiend → Todo 15 (Features 65–66); party spells → Todo 15 (Features 55–57); familiar/avatar → Todo 16 (Feature 85); Wheel/animus branches → Todo 16 (Features 79–82).

## Implementation

- Register callbacks in `/home/randal/code/tibia/server/src/combat/SpellRegistry.ts`, executed by `/home/randal/code/tibia/server/src/combat/SpellCaster.ts`.
- Catalog enablement via `/home/randal/code/tibia/server/src/combat/loadCanarySpellCatalog.ts` plus `/home/randal/code/tibia/tools/parseCanarySpells.mjs` regenerating `/home/randal/code/tibia/content/spells/canary-spells.json`.
- Food creation reuses the conjuring item path (`/home/randal/code/tibia/server/src/item/ConjureItemResult.ts`) — item creation is audited, single-step, server-rolled RNG.
- Player summons need summon-limit state shared with the existing monster summon runtime (global/per-type limits already enforced there).
- All Canary Lua spell callbacks are reimplemented as reviewed TypeScript; server rolls all RNG and enforces exhaust at execution time.

## Tests

- Per-spell tests in `/home/randal/code/tibia/server/src/combat/Combat.test.ts` and the SpellCaster suites with seeded RNG.
- Summon-limit tests: player summons cannot exceed shared global/per-type limits; forged summon intents rejected.

## Dependencies

- Todo 15 (Features 55–57, 61–64, 65–66) and Todo 16 (Features 79–82, 85) for delegated branches.
- Challenge/taunt semantics shared with Feature 23.
- Feeds Feature 26 (zero-disabled gate).
