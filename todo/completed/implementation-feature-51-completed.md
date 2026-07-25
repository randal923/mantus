# Feature 51 — completed

Use-with tool actions, from
[implementation-feature-51.md](../implementation-feature-51.md).

Cross-links: [implementation-feature-51.md](../implementation-feature-51.md) ·
[todo-13.md](../todo-13.md).

---

## 2026-07-25 — Machete, scythe, pick, crowbar, watch, fishing rod

**Problem.** Only rope and shovel existed; the rest of the classic tool family
was missing, so those items presented no crosshair and did nothing.

**What changed.** `getToolDefinition` grows to seven kinds (rope, shovel,
machete, scythe, pick, crowbar, fishing-rod) with Canary's own id allowlists,
including the "gear of eliteness" multi-tool ids each Lua handler accepts.
`ToolUseHandler` gained a shared `ToolUseContext` and per-tool handlers:

- `handleMacheteUse` — jungle grass and reed cuts (catalog decay regrows them),
  wild growth cleared outright with a poff.
- `handleScytheUse` — burning sugar cane, wheat, reed; each drops its bunch on
  the tile through `createEventWorldItem`, matching `Game.createItem`.
- `handlePickUse` — the earth dig, and the crushable boulder whose coin flip is
  rolled by `WorldActionRng` and can release a frazzlemaw through the spawn
  runtime.
- `handleFishingUse` — the water-id whitelist, Canary's catch chance
  `min(max(10 + (skill - 10) * 0.597, 10), 50)` read from the server's own
  fishing skill, the ice-hole/sand/dirty-water/elemental-remains arms with their
  rarity tables, and the fishing-skill advance. The worm and the catch commit
  together as one conjure, so bait can never be spent without its result.
- Crowbar is registered but fail-closed: every branch of Canary's
  `onUseCrowbar` is gated on a quest storage value.

Clocks and watches (Canary's `watch.lua`) became a `clock` world-action kind
plus `ClockHandler` for the two carried watches, both answering from
`worldTimeOfDay` — Canary's light clock, one Tibian day per real hour in
four-light-minute steps. The clock arm outranks the generic rotate behaviour of
the same pendulum-clock ids, as the Action registration does in Canary.

Reach is validated per tool: adjacency by default, and Canary's `allowFarUse`
for the fishing rod bounded to the same floor, 7×5 tiles, and line of sight.

**Files touched.** `server/src/item/getToolDefinition.ts`,
`server/src/action/{ToolUseHandler,ToolUseContext,handleMacheteUse,handleScytheUse,handlePickUse,handleFishingUse,harvestTables,fishingTables,ClockHandler,clockItemIds,handleClockRead,worldTimeOfDay}.ts`,
`server/src/action/{WorldAction,WorldActionContext,WorldActionRegistry,resolveWorldAction}.ts`,
`server/src/GameServer.ts`.

**How it was verified.** `ToolUseHandler.test.ts` (18 cases, including forged
targets out of reach, a harvest on a bare tile, the cross-floor far-use refusal,
no-bait fishing, and the crowbar fail-closed path), `worldTimeOfDay.test.ts`
(3), and a clock case in `WorldActionRegistry.test.ts`.

**Residual risk.** Rope on open holes (pull-up through a floor), sand digging
with loot RNG, and the toolgear jam are not implemented — see the feature file.

---

## 2026-07-25 — Rope on open holes, and the pinned hole-id classification

**Problem.** Two gaps, one root cause. Canary's `onUseRope` has a second arm
this project never had: used on an *open hole*, the rope lifts whatever stands
on the floor below out beside the hole. And because that arm was missing, the
converter classified hole placements by name — `staticItem.name.includes("hole")`
— emitting 3,439 permanently-disabled `rope-or-shovel` actions. Almost none of
them were rope targets: "lava hole" (2,683 placements), "tree hole", "small
hole", "strange holes", and "ornate door with a keyhole" are scenery.

**What changed.**

- `ROPE_HOLE_IDS` (`server/src/action/ropeHoleIds.ts`) carries Canary's pinned
  `holeId` table verbatim — 43 ids from
  `data-otservbr-global/scripts/lib/register_actions.lua` at `a879c931`.
- The converter emits a `rope-hole` world action for exactly those ids, with
  the destination Canary's `Position:moveUpstairs` produces when applied to the
  tile *below*: the tile south of the hole on the hole's own floor, falling back
  to the same neighbour scan ladders use. Unlike a ladder it is the floor
  *below* that must exist, and unlike the old emission it is not suppressed by
  a step floor change — Canary registers the action on the item id, so a hole
  you can fall into can also be roped through.
- `MapData.getAction` is now keyed by position **and** activation, so one tile
  can host both a `use` dropdown and a `use-with` rope hole — which is exactly
  how Canary registers sewer grate 435 (in both `holeId` and the dropdown set).
  Within one activation the more specific registration wins (rope spot before
  rope hole, ladder before dropdown), matching the order Canary's handlers test
  in; the loser is recorded as `duplicate-action`.
- `RopePullHandler` executes the pull inside the tick. A creature on the tile
  below outranks items (`Tile::getTopVisibleThing`), and only players are
  pullable — a rope never lifts a monster or NPC. The destination is
  re-validated for the *pulled* player through the new
  `MovementRules.canPlayerEnter`, so one player's rope cannot push another into
  a protection zone they are pz-locked out of, into a house they cannot enter,
  or onto an occupied tile. Items move through the shared `planMoveMapItem`,
  which is also what refuses immovable scenery and pristine static seeds.
- `ROPE_SPOT_IDS` in the converter dropped id 21501, which is not in Canary's
  `ropeSpots`/`specialRopeSpots` tables. It contributed 0 placements, so the
  content is unchanged and the list is now exactly the pinned one.

**Result.** 4,968 enabled `rope-hole` actions; disabled world actions fell
3,554 → 348, and every remaining one carries an explicit reason (the previous
run left 9 unlabelled).

**Files touched.** `server/src/action/{ropeHoleIds,RopePullHandler}.ts` (new),
`server/src/action/{ToolUseHandler,resolveWorldAction,WorldActionWorldView}.ts`,
`server/src/{MapAction,MapData,loadMapData,gridMapData,World}.ts`,
`server/src/world/{MovementRules,overrideMapData}.ts`,
`server/src/GameServer.ts`, `tools/convertOtbm.mjs`,
`content/source-manifest.json`, regenerated `server/data/otservbr.*` +
`client/public/assets/map/otservbr/`.

**How it was verified.** Six new cases in `ToolUseHandler.test.ts` (24 total):
the player below is lifted out and the roper stays put; a non-player creature is
never lifted; a pz-locked player is never pulled into a protection zone; a
replayed pull moves exactly one item and leaves none behind; nothing below
reports the failure; a forged out-of-reach target is refused. Full suites:
server 1113 passed, client 227 passed, `yarn test:tools` 69 passed +
`parity:check` clean.

**Residual risk.** Sand digging (item 231), the toolgear jam, tool-on-creature
and tool-on-inventory-item targets, and every quest-storage branch remain — see
the feature file. The 233 still-disabled rope holes have no walkable landing
tile at all (207 blocked, 74 missing, 53 at z15 with no floor below); they need
map-content review, not code.
