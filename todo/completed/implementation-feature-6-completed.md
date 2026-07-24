# Feature 6 — completed

Cross-links: [implementation-feature-6.md](../implementation-feature-6.md) ·
[todo-4.md](../todo-4.md).

---

## 2026-07-24 — Underground multi-floor dynamic visibility

**Problem.** Underground, the server sent creatures and mutable tile-item
states only for the player's own z, while the client already draws static
floors z±2 with OTClient cover rules. Dynamic entities on adjacent underground
floors were invisible — a parity gap (explicitly optional deviation).

**What changed (server-only; single visibility policy preserved).**

- `server/src/getFirstVisibleFloor.ts` — dropped the underground
  `return position.z` short-circuit. The covering walk now runs underground too,
  bounded below by `max(GROUND_FLOOR + 1, z - 2)` (the aware range), so it
  reveals floors up toward the surface only as far as the first roof/wall —
  never past cover (charter rule 6). Surface behavior is unchanged
  (`lowestFloor = 0`).
- `server/src/visibleFloorRange.ts` (new) — the single source of truth for the
  visible floor set: `[firstFloor .. surface? GROUND_FLOOR : min(15, z + 2)]`.
  Shared by the creature and map-item send paths so they can never drift from
  each other.
- `server/src/canSee.ts` — replaced the `viewer.z > GROUND_FLOOR && target.z !==
  viewer.z` own-floor clamp with an aware-range bound: underground upper bound
  `min(15, z + 2)`, and the top bound is clamped to `max(GROUND_FLOOR + 1,
  z - 2)` so a stale/too-low `firstVisibleFloor` can never leak the surface
  floor to an underground viewer (defense in depth — never trust the caller).
- `server/src/World.ts` (`creaturesVisibleFromFloor`) and
  `server/src/world/DynamicMapItems.ts` (`mapItemTilesVisibleFrom`,
  `mapItemTilesEnteringView`) — replaced the three duplicated
  own-floor-underground / surface-stack branches with `visibleFloorRange`. The
  per-tile `canSee` gate still runs, so send-filtering and rendering agree.
- `server/src/gridMapData.ts` — added a `transparentFloorView` test option
  (tiles that do not limit floor view) so tests can build an open shaft; every
  tile still limits floor view by default.

**Files touched.** `server/src/getFirstVisibleFloor.ts`,
`server/src/visibleFloorRange.ts` (new), `server/src/canSee.ts`,
`server/src/World.ts`, `server/src/world/DynamicMapItems.ts`,
`server/src/gridMapData.ts`, and tests
`server/src/getFirstVisibleFloor.test.ts`, `server/src/canSee.test.ts`,
`server/src/visibleFloorRange.test.ts` (new), `server/src/World.test.ts`,
`server/src/Visibility.test.ts`.

**Verification.** `yarn workspace server test` → 713 passed, 174 skipped (pg
integration), 0 failed. `yarn workspace server typecheck` clean. New coverage:
- creature on z+1 (below) is visible underground; creature one floor up is NOT
  leaked when the ceiling covers it, but IS visible through an open shaft;
  creature beyond the aware range (z+3) is not revealed (`World.test.ts`).
- `canSee`/`getFirstVisibleFloor` cover-aware bounds and the never-leak-surface
  clamp (`canSee.test.ts`, `getFirstVisibleFloor.test.ts`).
- view reconciliation on an underground floor change: the deep creature joins
  and the shallow one leaves the mover's known set (`Visibility.test.ts`).
- Updated two unit tests that had asserted the removed own-floor-only deviation.

**Residual risk.** The client was already drawing dynamic entities wherever the
server sends them across the drawn underground floors, so no client change was
needed. Deeper floors (z+1, z+2) are always in the aware range (matching
real-Tibia's protocol aware-range send); only the surface-ward direction is
cover-gated, which is where "leak through cover" applies.
