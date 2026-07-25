# Feature 25 — Custom combat areas for disabled player spells

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

Some pinned player spells use custom tile matrices and direction-dependent areas. The monster catalog already preserves its matrices; the player spell catalog does not, which keeps those spells disabled. The matrices must be representable as data without runtime Lua.

## Anchoring rule (fixed 2026-07-25 — read before touching areas)

Canary lays a combat area out around the **variant position**, never around
the caster: `AreaCombat::getList` computes `tmpPos = targetPos - matrixCentre`
and `getArea(centerPos, targetPos)` uses the caster only to pick the rotation.
For an untargeted cast the variant position is already the tile *ahead* of the
caster (`Spells::getCasterPosition` = `getNextPosition(dir, casterPos)`), and
the matrix centre — the `3` cell, which `createArea` also marks as an affected
tile (`value == 1 || value == 3`) — lands there. So a wave covers `length`
tiles starting one ahead and never touches the caster's own square.

Two off-by-one bugs against that rule were fixed:

- `server/src/combat/areaPositions.ts` anchored `directional` tile matrices on
  `origin` (the caster) instead of `center`, shifting every imported wave one
  tile backwards and putting the caster's own square inside it. Now anchors on
  `center` for every shape; `origin` only picks the rotation.
- `server/src/combat/Combat.ts` (`abilityCenter`) passed the *victim's*
  position as the area centre for monster abilities with `target: "direction"`,
  which after the fix above would have dropped a whole directional matrix on
  top of the victim. It now derives the tile ahead of the monster, mirroring
  `Spells::getCasterPosition`.

Cone/beam shapes were already correct (they walk `distance = 1..length` from
the origin, which is the same tile set) and non-directional matrices already
anchored on `center`. Regression tests: `areaPositions.test.ts` ("starts a
directional wave one tile ahead of the caster") and `Combat.test.ts` ("starts
a monster's directional wave ahead of it, not on its victim").

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
