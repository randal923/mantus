# Feature 50 — Remaining world-action kinds (chests, pressure plates, fields)

Part of [Todo 13 — Typed world actions](todo-13.md).

The teleport exploit-test box was closed 2026-07-25 — see the
[completed log](completed/implementation-feature-50-completed.md). **Everything
else in this feature is still not started.**

## Why

The action registry, doors, levers, readables, rope spots, shovel holes,
rotation/transforms and use-activated dropdowns have shipped. Three whole
action kinds have not.

## Remaining work

- **Repeatable chests.** Not started. New `handleChestUse.ts` following the
  `handleDoorUse.ts` pattern, registered in `WorldActionRegistry.ts`, plus a
  `chest` arm in `resolveWorldAction.ts` (chests are scripted placements today
  and therefore fail closed, which is the correct default until this lands).
  Loot is **server-rolled** — all RNG server-side — and durable chest state
  uses materialize-on-first-mutation + version bump + audit, exactly like
  `planTransformMapItem`. Per-character "already looted" state needs its own
  table keyed by (character, chest); a replayed use must yield exactly one
  loot grant.
- **Pressure plates.** Not started. Needs a step-in hook in
  `server/src/MovementHandler.ts` / `server/src/world/MovementRules.ts`; the
  door auto-close step-out hook (`WorldActionRegistry.closeDoorBehind`) is the
  shape to copy.
- **Fields (fire/energy/poison).** Not started, and **blocked on content**: the
  pinned item catalog imports `kind: "magicfield"` for 45 types but no `field`
  payload, so there is no damage/duration data to drive them. The importer
  needs to emit `ItemType.field` (already declared, always undefined today)
  before the combat-damage hook can be written.
- **Recorded dropdown deviations**, still unresolved:
  - Oramond sewer grate 21298 drops one floor here vs two floors + one tile
    east in Canary's quest script.
  - Dropdowns over blocked/missing destination tiles are disabled at conversion
    time instead of Canary's `FLAG_NOLIMIT` force-teleport.

## Tests

- Replayed chest use yields exactly one loot grant.
- Forged action id/target/position/destination rejected for each new kind
  (extends the shipped forgery matrix).
- Simultaneous teleport users leave coherent state — **done**, see the
  completed log.

## Dependencies

- Feature 103/105 (quest storage platform) for storage-gated variants — quest
  chests and scripted teleports defer there.
- Feature 52 (shared execution-guarantee helper) benefits every handler added
  here.
- Asset-import work for `ItemType.field`.
