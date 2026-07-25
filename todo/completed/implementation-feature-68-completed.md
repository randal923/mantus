# Feature 68 — completed

Minimap completion, from
[implementation-feature-68.md](../implementation-feature-68.md).

Cross-links: [todo-16.md](../todo-16.md).

---

## 2026-07-25 — Server-routed autowalk, markers, cache-busting, town labels

**Problem.** Four gaps: click-to-autowalk (blocked on a server-validated
walk-to intent), persistent map markers, a cache-busting version for the baked
minimap PNGs, and town labels at low zoom.

**What changed.**

*Autowalk.* The new `walk-to` intent carries **only a destination**. The
server bounds it (same floor, inside `maxWalkToDistance`), runs the existing
bounded `findPath` over its *own* walkability — including the same house
authorization every step check uses, so a route can never lead through a
locked house — and then feeds the result through the existing auto-walk step
loop, which re-validates every step in the tick. This deliberately does not
reintroduce the rejected client step-queue/resend patterns noted in the
project memory: the client sends one message and never a route, and the
per-session cooldown bounds how often the server will search.

*Markers.* `character_map_markers` (migration `052_minimap_markers.sql`) is
keyed by tile, so placing a flag twice replaces it instead of growing the
list, and the cap is re-counted inside the same transaction that writes.
Marker lists are private to their owner. Right-click on the minimap toggles a
flag; left-click (without panning) walks there.

*Cache-busting.* `yarn minimap:build` now stamps `manifest.minimapVersion`
from a digest of the tile files it actually wrote, and `MinimapRegionStore`
prefers it over `manifest.version`. That closes the real gap: re-baking tiles
without re-converting the map previously left the map version — and therefore
the browser's tile cache — unchanged.

*Town labels.* Drawn from the manifest's existing `towns[]` at zoom levels
where individual tiles are unreadable anyway.

**Files touched.**
`server/db/migrations/052_minimap_markers.sql`,
`server/src/minimap/{MarkerService,MarkerStore,PgMarkerStore}.ts`,
`server/src/MovementHandler.ts`,
`server/src/{GameServer,CharacterHandler,index}.ts`,
`protocol/src/{minimap,index,clientMessages,serverMessages}.ts`,
`tools/buildMinimapTiles.mjs`,
`client/lib/minimap/{MinimapRegionStore,drawMinimap}.ts`,
`client/components/minimap/MinimapPanel.tsx`,
`client/components/game-window/{GameMinimapOverlay.tsx,messages/handleCommunityMessage.ts,store/createGameWindowStore.ts,types/{GameWindowState,GameWindowStoreActions}.ts}`,
`client/lib/net/GameClient.ts`.

**How it was verified.** `MovementIntentSchemas.test.ts` — `walk-to` accepts a
destination only and rejects a smuggled direction list, a missing/omitted
floor, and out-of-range coordinates; marker intents are bounded on icon id and
text length. The path itself runs through `findPath`, which has its own
determinism and work-bound tests, and every step still goes through the
auto-walk loop the existing movement tests cover.

**Residual risk.** Markers have no icon/text UI yet — the client places a
default flag and deletes on repeat right-click; the protocol already carries
both fields.
