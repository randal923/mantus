# Todo 3 — Creatures, spawns, and AI

**Features 9, 10.** The full creature world shipped: typed
`MonsterType`/`NpcType` data, all 84,294 placements behind passing
benchmarks, tick-owned `SpawnManager`, budgeted AI with z-aware A*, the
911-monster parity audit, voices/summons, machine-verified bestiary/raceId
coverage, and stable variant addressing (see [done.md](done.md)). Both
remaining features are mostly blocked on other areas' typed representations.

## Feature 9 — Creature importer typed-data completeness

The world import report must reach zero ignored gameplay assignments; every
procedural callback becomes typed data or reviewed TypeScript — never
executed Lua. As of 2026-07-26: gaps `covered` by the bestiary importer
(with the guard test re-deriving coverage from `bestiary.json` rather than
trusting labels), 1 `upstream-defect` (Crypt Warrior's Bestiary block has
no raceId), and **150 still `blocked`** (ceilings pinned in
`creatureImportReport.test.ts`: 739 definitions / 1,573 ignored / 150
blocked).

**Remaining work**

- ~~Reward-boss classification~~ — resolved 2026-07-26 with Feature 76:
  `flags.rewardBoss` is imported onto `MonsterType` (44 reward bosses), the
  911-monster blocked bucket closed, and the challenge/melee-pull guards
  ship with it.
- ~~Prey classification~~ — resolved 2026-07-26 with Feature 74:
  `isPreyExclusive` is imported onto bestiary entries
  (`tools/parseCanaryBestiary.mjs` → `BestiaryCatalogEntry.preyExclusive`);
  `isPreyable` has no `false` setter at the pin, so nothing to import.
- **Three NPC entries** (`onSay` ×2, `moneyToNeedDonation`) — todo-7.
- Already typed or resolved (do NOT redo): static mana cost, light,
  target-change rules, hidden health, static-attack chance; all 54 registered
  monster event names and all 15 active MonsterType callbacks have reviewed
  runtime handlers (incl. delayed transformations and teleports); the whole
  `NpcType` model; race/bestiary/bosstiary metadata.

**Implementation**

- Extend `server/src/creature/MonsterType.ts` / `NpcType.ts`; importers
  `tools/importCanaryCreatures.mjs`, `tools/parseCanaryCreatureContent.mjs`,
  `tools/importCanaryNpcs.mjs`; loaders in
  `server/src/spawn/loadCreatureContent.ts`. Drive from
  `content/world-import-report.json` and
  `content/npcs/canary-npc-import-report.json`.
- Offline parsing only; procedural behavior lands in
  `server/src/creature/MonsterEventService.ts` / `MonsterEventHooks.ts`.

**Tests**

- `server/src/spawn/creatureImportReport.test.ts` (7 cases, incl. the
  bestiary coverage proof and separate blocked/upstream-defect ceilings) is
  landed — a newly ignored gameplay assignment fails the run. Add loader
  round-trip tests for each new typed field.

## Feature 10 — Placement disambiguation and creature parity gate

Aggregate pins are landed (911 monster types, 956 NPC types, 83,286 monster
placements, 1,008 NPC placements, 84,294 slots in
`creatureParityGate.test.ts` / `CreaturePerformance.test.ts`); variant
addressing landed 2026-07-25 (duplicates 25 → 1, ambiguous 20 → 1 — both the
genuine Harlow collision), with ids re-derived from pinned type names so a
normalization change fails the test.

**Remaining work**

- **Harlow** — the one genuine upstream duplicate: `harlow.lua` and
  `harlow_trade.lua` both register the type name "Harlow"; the world
  placement resolves to `harlow.lua` by file-name match. Review that choice.
- **Import the 67 recorded variant definitions** (`variantFamilies` in the
  report) — each has a stable id; nothing places them because their spawning
  quest scripts are todo-13 content.
- Review the `outOfMap` (276) and `blocked` (525) placements per entry.
- Gate closure on zero unreviewed creature/NPC gameplay fields (waits on
  Feature 9).

**Implementation**

- Work from the alias/duplicate/blocked sections of
  `content/world-import-report.json` and
  `content/starter-import-report.json`; variant support lives in
  `content/monsters/world-monsters.json` + `tools/importCanaryCreatures.mjs`.
- All resolution is offline importer/content work; runtime spawn behavior
  stays inside the tick-owned `SpawnManager` unchanged.

[Back to overview](README.md)
