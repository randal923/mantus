# Feature 6 — Underground multi-floor dynamic visibility

Part of [Todo 4 — Rendering and animation](todo-4.md).

## Why
Parity gap (explicitly optional): underground, the server sends creatures/tile-states only for the player's own z, while the client already draws static floors z±2 with OTClient cover rules. OTClient shows dynamic entities on all drawn underground floors.

## Remaining work
- Extend `creaturesVisibleFrom`/`mapItemTilesVisibleFrom`/`canSee` to include drawn underground floors instead of own-floor only.

## Implementation
VERIFIED STILL OPEN: `server/src/World.ts` lines 278-279 — `position.z > GROUND_FLOOR ? [position.z] : ...` in `creaturesVisibleFromFloor`. Change the underground branch to a cover-aware z-range matching `client/lib/render/getVisibleFloors.ts`; update `mapItemTilesVisibleFrom` (`World.ts` line 314) and the `canSee` policy in lockstep so send-filtering and rendering agree — there must remain a single visibility policy.

Charter rule 6 applies: only send floors genuinely visible under cover rules — never leak dynamic entities through cover.

Canary/OTClient reference: OTClient underground floor-visibility (cover) rules already mirrored in `getVisibleFloors.ts`.

## Tests
- Underground creature on z±1 is visible when uncovered.
- Underground creature is not leaked through cover.
- Visibility reconciliation on underground floor change.

## Dependencies
- Parity decision (explicitly optional deviation).
- Must stay consistent with the single visibility policy established in the map/movement work (Todo 3).
