# Feature 88 — Client performance budgets and streaming

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Two concrete streaming hitches are known, and the client has no formal performance budgets to hold polish features accountable to.

## Remaining work
- Performance budgets for region streaming, sprite count, animated items, effects, UI updates, and low-power behavior.
- Sheet upload hitch: sheets streaming in while walking upload to the GPU on first draw — a one-frame hitch per new sheet. Fix: call `renderer.texture.initSource` inside `AssetStore.loadSheet` (or use compressed textures).
- Region re-entry cost: re-entering a long-left area re-pays region fetch + sheet decode mid-walk (`MAX_CACHED_REGIONS = 48`); consider prefetching regions adjacent to the walk direction.

## Implementation
- `client/lib/render/WorldRenderer.ts` and `client/lib/render/AssetStore.ts`.
- Budgets belong with the todo-22 perf follow-ups (Feature 107) — define them there and enforce here.

## Tests
- Frame-time regression check for the first-draw hitch after the `initSource` fix.

## Dependencies
- Feature 107 (client perf follow-ups own the budget definitions).
