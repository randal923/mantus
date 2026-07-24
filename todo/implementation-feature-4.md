# Feature 4 — Disabled map transitions and movement-action parity resolution

Part of [Todo 3 — Map and movement](todo-3.md).

## Why
Every disabled transition, movement action, zone behavior, and invalid placement from the pinned source must be individually resolved so no player-visible map behavior stays silently unsupported. Entries stay disabled rather than ever accepting client-authored destinations.

## Remaining work
- Resolve every disabled transition, movement action, zone behavior, and invalid placement in the parity audit.
- Remaining ladder/hole/rope/shovel and scripted movement actions belong to world actions ([Todo 13](todo-13.md)); house/zone ownership belongs to houses ([Todo 15](todo-15.md)).
- Floor-change items with absent Canary-compatible targets are currently classified and kept disabled as unresolved metadata — each must reach a resolved state.

## Implementation
The converter classifies unresolved floor-change items as disabled metadata: `tools/convertOtbm.mjs` + `tools/getMapItemSemantics.mjs` outputs consumed by `server/src/MapAction.ts` / `server/src/MapTransition.ts`. Drive each disabled entry through its owning todo (Features 50-53 for scripted movement actions, Features 61-64 for house/zone ownership), implement each as a server-side world action executed in the tick (never client-authored destinations), and update converter classification + parity report until zero silently-unsupported map behaviors remain.

Canary reference: pinned datapack movement/action registrations for each disabled entry.

## Tests
- Per-resolved-action converter fixtures.
- Aggregate count check asserting disabled entries only decrease across re-imports.

## Dependencies
- Features 50-53 (world actions: remaining action kinds, tool actions, registry guarantees, action parity inventory).
- Features 61-64 (houses: auctions, access lists, guildhall, polish) for house/zone ownership behaviors.
- Feeds Feature 1's ledger workstream 2 (map/movement parity).
