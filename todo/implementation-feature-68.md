# Feature 68 — Minimap completion

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
The minimap panel core shipped (baked terrain tiles, live markers, floors, zoom, pan); four gaps remain, one of which (autowalk) is blocked on a server-validated walk-to intent that does not exist yet.

## Remaining work
- Click-to-autowalk — blocked on a server-validated walk-to/path intent.
- Server-pushed map markers + player-placed persistent waypoint flags.
- Server/world-version cache invalidation for baked minimap PNGs — a map re-convert needs a cache-busting version in the manifest.
- Town name labels at low zoom — manifest `towns[]` already has the data.

## Implementation
- Autowalk: new zod intent with a bounded destination; server computes the path and re-validates every step in `server/src/MovementHandler.ts`/`server/src/world/MovementRules.ts` (adjacent, walkable, speed — charter movement rules). Note the project memory "keep walking simple" (no step queues or resend loops on the client): autowalk must be a server-driven step sequence, not a client-side step queue — design it so it doesn't reintroduce the rejected patterns.
- Markers: per-character persisted marker table + bounded create/move/delete intents; server-pushed markers via a push message in `protocol/src/serverMessages.ts`.
- Cache-busting: emit a version in the minimap manifest from `yarn minimap:build` (and remember minimap:build must rerun after convertOtbm, per render-bug memory).
- Town labels: client-only, from manifest `towns[]`.

## Tests
- Autowalk destinations bounded; each step re-validated server-side (teleport/large-delta rejection still holds).
- Marker counts bounded per character; forged marker ids rejected.

## Dependencies
- Pathfinding/walk-to intent (new; coordinate with movement system).
- Conflicts to resolve with the "walking mechanic: keep it simple" memory — flag the design before implementing.
