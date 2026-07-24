# Feature 9 — Creature importer typed-data completeness

Part of [Todo 5 — Creatures, spawns, and AI](todo-5.md).

## Why

The world import report still lists ignored gameplay assignments; parity requires zero of them. Every ignored assignment and procedural callback must become typed data or reviewed TypeScript — never executed Lua.

## Remaining work

- Extend `MonsterType`, `NpcType`, and the importers to represent the remaining ignored assignments: race/bestiary/bosstiary metadata, forge and reward-boss classifications.
- Already typed (do NOT redo): static mana cost, light, target-change rules, hidden health, static-attack chance; all 54 registered monster event names and all 15 active MonsterType callbacks already have reviewed runtime handlers, including delayed transformations and teleports.
- Delegated blockers stay with their owners: loot/corpse/reward-boss callbacks → Todo 9 (Features 29–31); NPC behavior → Todo 11 (Features 37–42); bestiary/bosstiary/forge classifications → Todo 16 (Features 77–78).
- Add report assertions that fail when a new ignored assignment appears, so the gap cannot silently reopen.

## Implementation

- Extend type definitions in `/home/randal/code/tibia/server/src/creature/MonsterType.ts` and `/home/randal/code/tibia/server/src/creature/NpcType.ts`.
- Extend importer scripts `/home/randal/code/tibia/tools/importCanaryCreatures.mjs`, `/home/randal/code/tibia/tools/parseCanaryCreatureContent.mjs`, and `/home/randal/code/tibia/tools/importCanaryNpcs.mjs`; loaders in `/home/randal/code/tibia/server/src/spawn/loadCreatureContent.ts`.
- Generated reports to drive from: `/home/randal/code/tibia/content/world-import-report.json` and `/home/randal/code/tibia/content/npcs/canary-npc-import-report.json`.
- Parsing happens offline only — the importer parses a whitelisted literal Lua subset and never executes Lua; any procedural behavior is reimplemented as reviewed TypeScript handlers in `/home/randal/code/tibia/server/src/creature/MonsterEventService.ts` / `MonsterEventHooks.ts`.
- Canary (pinned `opentibiabr/canary`) monster/NPC Lua files are the source of truth for the remaining fields.

## Tests

- Report assertion test: importing with a newly ignored gameplay assignment fails the build/test run.
- Loader tests asserting the new typed fields round-trip from importer output through `loadCreatureContent.ts`.

## Dependencies

- Todo 9 (Features 29–31) for loot/corpse/reward-boss callbacks.
- Todo 11 (Features 37–42) for NPC behavior.
- Todo 16 (Features 77–78) for bestiary/bosstiary/forge classifications.
