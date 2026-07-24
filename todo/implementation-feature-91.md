# Feature 91 — Client state boundaries and bounded resources

Part of [Todo 17 — Client and session resilience](todo-17.md).

## Why
Client caches and Pixi display objects currently have no explicit bounds or ownership rules; long sessions with repeated region/floor changes can leak resources, and gameplay state can silently migrate into render objects. The perf pass landed related-but-distinct work (HUD re-render isolation, shared outfit texture cache) — none of the boundary/bounding work itself is done.

## Remaining work
- Key server entities by stable ids/revisions; Pixi display objects must not become a source of gameplay state.
- Separate connection/domain state from rendering and React panels; derive views without effect-driven copies.
- Bound the map-region, message, effect, battle-list, and container caches; dispose Pixi resources and listeners deterministically.
- Surface rejected intents and authoritative corrections to the player without leaking server internals.

## Implementation
- Cache bounding and disposal: `client/lib/render/WorldRenderer.ts` and `client/lib/render/MapView.ts` (region/tile caches) — explicit LRU/size caps plus disposal tied to floor/region changes; reuse the `passabilityRevision`-style invalidation pattern.
- Domain/render separation: `client/lib/net/GameClient.ts` and `client/components/game-window/store/createGameWindowStore.ts`.
- Rejected-intent/correction surfacing via `client/components/game-window/GameNotifications.tsx`.

## Tests
- Cache and resource counts stay bounded through repeated region/floor changes (e2e resource-count assertions in `client/e2e/`).
- Authoritative corrections produce the intended UI (store unit tests).

## Dependencies
- Feature 90 (stable-id/revision keying comes from the revisioned stream; `clearTransient()` on reconnect interacts with disposal paths).
