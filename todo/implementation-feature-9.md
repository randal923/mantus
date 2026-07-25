# Feature 9 — Creature importer typed-data completeness

Part of [Todo 5 — Creatures, spawns, and AI](todo-5.md).

> **Status: open.** As of 2026-07-25 the report classifies 1,424 gaps `covered`
> (bestiary/bosstiary/raceId — owned by `tools/importCanaryBestiary.mjs`, and the
> guard test re-derives that coverage from `bestiary.json` rather than trusting
> the label), 1 `upstream-defect` (a Bestiary block with no raceId), and 1,061
> still `blocked` on Todo 16 (prey flags → Feature 74, reward-boss flags →
> Features 76/84) plus three NPC entries on Todo 11. Finished sub-work is logged
> in
> [completed/implementation-feature-9-completed.md](completed/implementation-feature-9-completed.md).
> Do not archive until the blocked surface reaches zero.

## Why

The world import report still lists ignored gameplay assignments; parity requires zero of them. Every ignored assignment and procedural callback must become typed data or reviewed TypeScript — never executed Lua.

## Remaining work

- **Reward-boss classification** (`flags.rewardBoss`, 911 monsters) — needs the
  typed representation from Todo 16 Features 76/84.
- **Prey classification** (`flags.isPreyExclusive` 146, `flags.isPreyable` 1) —
  needs Todo 16 Feature 74.
- **Three NPC entries** (`onSay` ×2, `moneyToNeedDonation`) — Todo 11.
- Already typed or resolved (do NOT redo): static mana cost, light,
  target-change rules, hidden health, static-attack chance; all 54 registered
  monster event names and all 15 active MonsterType callbacks have reviewed
  runtime handlers, including delayed transformations and teleports; the whole
  `NpcType` model (Feature 37); race/bestiary/bosstiary metadata, which
  `tools/importCanaryBestiary.mjs` owns and the report now marks `covered`.
- ~~Add report assertions that fail when a new ignored assignment appears.~~
  Landed: `server/src/spawn/creatureImportReport.test.ts` (7 cases), including a
  coverage proof against `bestiary.json` and separate ceilings for blocked vs
  upstream-defect gaps.

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
