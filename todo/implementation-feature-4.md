# Feature 4 — Disabled map transitions and movement-action parity resolution

Part of [Todo 3 — Map and movement](todo-3.md).

> **Status: open umbrella.** Per-entry resolution is delegated to Features
> 50-53 (world tool actions) and 61-64 (house/zone ownership). Finished
> self-contained sub-work is logged in
> [completed/implementation-feature-4-completed.md](completed/implementation-feature-4-completed.md).
> The aggregate parity-ceiling regression (this feature's stated "disabled
> entries only decrease" test) has landed as
> `server/src/mapParityCeiling.test.ts`. Do not archive this feature until the
> disabled/unresolved counts reach zero. Disabled world actions fell 3,554 →
> 348 on 2026-07-25 when the name-matched hole classification was replaced with
> Canary's pinned `holeId` table (Feature 51).

## Why
Every disabled transition, movement action, zone behavior, and invalid placement from the pinned source must be individually resolved so no player-visible map behavior stays silently unsupported. Entries stay disabled rather than ever accepting client-authored destinations.

## Remaining work
As of 2026-07-25 the audit stands at **348 disabled world actions** (was 3,554)
and **5,557 unresolved floor transitions**. Every disabled action now names an
audited reason, gated by `mapParityCeiling.test.ts`.

- The 348 disabled actions each need a content decision, not a classifier fix:
  207 `blocked-destination` and 74 `missing-destination` (no walkable landing
  tile even after the moveUpstairs neighbour scan), 53 `no-floor-below` /
  1 `no-floor-above` (correctly disabled at the map's floor limits),
  9 `duplicate-action`, 4 `requires-content-action`.
- Re-audit the `source-not-walkable` transition bucket (4,156). Two groups
  dominate and both may be correctly transition-less rather than unresolved:
  roof pieces 5033/5035/5037/5039 (1,830) and holes 7515-7522 (~1,400), the
  latter now covered by the `rope-hole` use-with action instead of a step
  transition.
- `missing-destination` (892) and `blocked-destination` (182) transitions still
  need per-entry review; `requires-content-action` (323) waits on scripted
  action/unique-id ownership.
- Remaining scripted movement actions belong to world actions ([Todo 13](todo-13.md));
  house/zone ownership belongs to houses ([Todo 15](todo-15.md)).

## Implementation
The converter classifies unresolved floor-change items as disabled metadata: `tools/convertOtbm.mjs` + `tools/getMapItemSemantics.mjs` outputs consumed by `server/src/MapAction.ts` / `server/src/MapTransition.ts`. Drive each disabled entry through its owning todo (Features 50-53 for scripted movement actions, Features 61-64 for house/zone ownership), implement each as a server-side world action executed in the tick (never client-authored destinations), and update converter classification + parity report until zero silently-unsupported map behaviors remain.

Canary reference: pinned datapack movement/action registrations for each disabled entry.

## Tests
- Per-resolved-action converter fixtures.
- ~~Aggregate count check asserting disabled entries only decrease across re-imports.~~
  Landed: `server/src/mapParityCeiling.test.ts` pins current disabled/unresolved
  counts (by reason **and** kind) as a monotonic ceiling, and asserts every
  disabled action names an audited reason — an unlabelled entry or a new
  category fails the gate.

## Dependencies
- Features 50-53 (world actions: remaining action kinds, tool actions, registry guarantees, action parity inventory).
- Features 61-64 (houses: auctions, access lists, guildhall, polish) for house/zone ownership behaviors.
- Feeds Feature 1's ledger workstream 2 (map/movement parity).
