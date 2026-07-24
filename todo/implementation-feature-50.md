# Feature 50 — Remaining world-action kinds (chests, pressure plates, teleports, fields)

Part of [Todo 13 — Typed world actions](todo-13.md).

## Why
The action registry, doors, levers, readables, rope spots, shovel holes, rotation/transforms, and use-activated dropdowns have shipped, but four whole action kinds have not been started, and the teleport half of the exploit-test matrix is blocked on them.

## Remaining work
- Repeatable chests: not started.
- Pressure plates: not started.
- Use-activated teleports: not started; the teleport exploit-test box is half-done ("state coherent for simultaneous users" awaits teleports).
- Fields (fire/energy/poison etc.): not started; interact with combat damage.
- Recorded dropdown deviations to resolve or keep documented:
  - Oramond sewer grate 21298 drops one floor here vs two floors + one tile east in Canary's quest script.
  - Dropdowns over blocked/missing destination tiles are disabled at conversion time instead of Canary's `FLAG_NOLIMIT` force-teleport.

## Implementation
- New handlers in `server/src/action/` — one file per handler, following the `handleDoorUse.ts` pattern — registered in `WorldActionRegistry.ts`. Every handler re-checks item/version, position, reach, and destination at execution time inside the tick (charter: never act on stale validation).
- Teleports and pressure plates need step-in hooks; the door auto-close step-out hook shows the pattern. The movement side lives in `server/src/MovementHandler.ts` / `server/src/world/MovementRules.ts`.
- Fields hook into combat damage application.
- Chest loot is server-rolled (all RNG server-side); durable chest state uses materialize-on-first-mutation + version bump + audit, like `planTransformMapItem`.

## Tests
- Simultaneous teleport users leave coherent state (completes the half-done exploit-test box).
- Replayed chest use yields exactly one loot grant.
- Forged action id/target/position/destination rejected for each new kind (extends the shipped forgery matrix).

## Dependencies
- Feature 103/105 (quest storage platform) for storage-gated variants — quest chests and scripted teleports defer there.
- Feature 52 (shared execution-guarantee helper) benefits every handler added here.
