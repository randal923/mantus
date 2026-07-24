# Feature 25 — Custom combat areas for disabled player spells

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

Some pinned player spells use custom tile matrices and direction-dependent areas. The monster catalog already preserves its matrices; the player spell catalog does not, which keeps those spells disabled. The matrices must be representable as data without runtime Lua.

## Remaining work

- Extend the area representation so custom tile matrices and direction-dependent areas from the disabled player spell catalog become typed data.
- Enable the affected spells once their areas load.

## Implementation

- Extend the area representation in `/home/randal/code/tibia/server/src/combat/areaPositions.ts` (plus its test).
- Extend `/home/randal/code/tibia/tools/parseCanarySpells.mjs` to emit matrix data into `/home/randal/code/tibia/content/spells/canary-spells.json`.
- Enable loading in `/home/randal/code/tibia/server/src/combat/loadCanarySpellCatalog.ts`.
- Reference: the monster-spell import already preserves custom matrices — mirror that representation.

## Tests

- `areaPositions` tests covering matrix rotation/direction-dependence against pinned Canary area definitions.
- Catalog load test: previously disabled matrix spells load with correct affected-tile sets.

## Dependencies

- Feeds Feature 26 (spell-report zero-disabled gate).
