# Feature 8 — Effects/missiles vs onTop draw order

Part of [Todo 4 — Rendering and animation](todo-4.md).

## Why
Accepted deviation: combat effects/missiles/floating text render in a per-floor transient container above `floor.objects` (perf: avoids a whole-floor re-sort per spawn), so they draw above `onTop`-flagged pieces such as archway tops (`MAP_DEPTH.onTop = 896`) instead of beneath them at `MAP_DEPTH.effect = 768`.

## Remaining work
- If parity matters: either rejoin effects to the sorted objects layer, or give onTop pieces their own overlay above the transient container.

## Implementation
Client-only, in the floor-container rendering paths under `client/lib/render/` (per-floor transient container + `MAP_DEPTH` constants). Preferred approach: move onTop pieces into their own overlay container above the effect container, keeping the no-re-sort perf win while restoring correct occlusion.

## Tests
- Render test: a missile passing under an archway top asserts occlusion (missile drawn beneath the onTop piece).

## Dependencies
- Parity decision (deliberate deviation, may be accepted permanently).
- Interacts with combat effects producers from the combat work (Features 21-28, especially Feature 22 spell artwork).
