# Feature 10 — Placement disambiguation and creature parity gate

Part of [Todo 5 — Creatures, spawns, and AI](todo-5.md).

> **Status: open.** The aggregate definition/placement parity pins + report
> reconciliation have landed (`server/src/spawn/creatureParityGate.test.ts` and
> `CreaturePerformance.test.ts`; zero-unreviewed-fields gate in
> `creatureImportReport.test.ts` from Feature 9). Stable variant-id addressing
> landed 2026-07-25: duplicates 25 → 1 and ambiguous 20 → 1, both the same
> genuine upstream collision (Harlow). Still open: that one decision, per-entry
> review of the blocked/out-of-map buckets, importing the 67 recorded variant
> definitions (needs the quest scripts that spawn them), and full gate closure —
> which depends on Feature 9's field-typing (blocked on Todo 11/16). Finished
> sub-work is logged in
> [completed/implementation-feature-10-completed.md](completed/implementation-feature-10-completed.md).

## Why

Import normalization currently resolves duplicates and bad placements in aggregate; final parity requires each one reviewed individually, valid variants kept addressable, and the counts locked by tests so regressions cannot slip in.

## Remaining work

- **Harlow** — the one genuine duplicate: `harlow.lua` and `harlow_trade.lua`
  both register the type name "Harlow" upstream. The world placement currently
  resolves to `harlow.lua` by file-name match; that choice needs review.
- **Import the 67 recorded variant definitions** (`variantFamilies` in the
  report). Each has a stable addressable id already; they are not imported as
  types because nothing places them — the quest scripts that spawn them are
  Features 103-105.
- Review the `outOfMap` (276) and `blocked` (525) placements per entry.
- ~~Keep valid variants addressable instead of picking one by filename accident.~~
  Landed 2026-07-25.
- ~~Add aggregate parity tests for definition and placement counts.~~ Landed:
  911 monster types, 956 NPC types, 83,286 monster placements, 1,008 NPC
  placements, 84,294 slots.
- Gate closure on zero unreviewed creature/NPC gameplay fields or callbacks
  (waits on Feature 9).

## Implementation

- Work from the alias/duplicate/blocked sections of `/home/randal/code/tibia/content/world-import-report.json` and `/home/randal/code/tibia/content/starter-import-report.json`.
- Variant addressing likely needs stable variant ids in `/home/randal/code/tibia/content/monsters/world-monsters.json` plus support in `/home/randal/code/tibia/tools/importCanaryCreatures.mjs`.
- Extend the aggregate pin tests in `/home/randal/code/tibia/server/src/spawn/loadCreatureContent.test.ts` and `/home/randal/code/tibia/server/src/spawn/CreaturePerformance.test.ts` with count assertions and a zero-unreviewed-fields assertion over the generated report.
- All resolution is offline importer/content work; runtime spawn behavior stays inside the tick-owned `SpawnManager` with its execution-time re-checks unchanged.

## Tests

- Aggregate pins: exact monster-type, NPC-type, monster-placement, and NPC-placement counts asserted.
- Zero-unreviewed-fields assertion over `world-import-report.json` (fails if any gameplay field or callback is unreviewed).
- ~~Variant-id stability test: re-running the importer preserves variant ids.~~
  Landed: ids are re-derived from the recorded pinned type names in
  `creatureParityGate.test.ts`, so a normalization change fails the test.

## Dependencies

- Feature 9 (importer typed-data completeness) must land first.
- Delegated owners: Todo 9 (Features 29–31), Todo 11 (Features 37–42), Todo 16 (Features 77–78).
