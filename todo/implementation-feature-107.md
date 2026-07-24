# Feature 107 — Client performance deferred items

Part of [Todo 22 — Performance follow-ups](todo-22.md).

## Why
Deferred from the 2026-07-24 optimization pass; all are **measure first** — profile before implementing. (The effects/missiles-above-onTop rendering deviation is tracked in the rendering area, todo-4, not here.)

## Remaining work
- `GameClient` parses every frame with `JSON.parse` + zod on the main thread; big payloads (welcome, depot browse, market lists) could parse in a Web Worker — measure welcome/depot parse timing first.
- The `WorldRenderer` per-frame loop allocates ~8 short-lived objects per creature per frame. Fix: scratch objects, numeric elevation-cache keys, and a per-view dirty flag to skip idle creatures. This touches the renderer core loop — use the headless screenshot harness for verification.
- `MapView.tileItems` recomputes merge+sort per query; `applyCover` calls it repeatedly on every own-player step. Fix: memoize per `tileKey`, invalidated by the same events that call `redrawTileKey`.

## Implementation
- Files: `client/lib/net/GameClient.ts`, `client/lib/render/WorldRenderer.ts`, `client/lib/render/MapView.ts`.
- Gate each change on frame profiling / parse-timing measurements; renderer changes verified with the headless screenshot harness before merging.

## Tests
- Headless screenshot comparison for any `WorldRenderer` change.
- `tileItems` memoization invalidation matches `redrawTileKey` events (unit test).
- Recorded before/after profiling numbers for each landed item.

## Dependencies
- Measurements first: welcome/depot parse timing and frame profiling.
- Feature 91's cache-bounding work touches the same `MapView`/`WorldRenderer` caches — coordinate if both land.
