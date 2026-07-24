# Performance follow-ups

Deferred items from the 2026-07-24 optimization pass. That pass landed the
high-impact, low-risk fixes (visibility broadcast dedup + serialize-once,
quadratic tile-states batching, non-allocating occupancy checks, findPath
parent-pointer reconstruction, first-visible-floor cache keyed on a
passability-only revision, per-tick queue drains, equipment/stats memoization,
dirty-tracked skills/storage saves, client HUD re-render isolation, shared
outfit texture cache, atlas-based combat effects). The items below were judged
worthwhile but not safe or valuable enough to do blind — most want a
measurement first.

## Server

- **`PG_POOL_MAX` default (20) may be low under load.** Serializable item/
  market transactions plus interval character saves each hold a client for a
  full round-trip. Recommended: raise the default to 30–40 once expected
  concurrent player counts and the Postgres `max_connections` budget are
  known. Config-only change in `server/src/index.ts`.
- **`MonsterBrain.acquireTarget` sorts all candidates with `localeCompare`
  tiebreaks and re-checks `world.canSee` per candidate.** Cheap predicates
  should short-circuit before `canSee`, and the full sort can become a
  single-pass min for the `nearest`/`health`/`damage` strategies. Behavior-
  sensitive (tie ordering) — needs a parity test against the current picker
  before changing.
- **Character creation does per-item/per-skill INSERT loops**
  (`insertStarterSet.ts`, `insertCharacterSkills.ts`). Rare path; batch with
  `unnest` only if creation latency ever matters.
- **`ChatHandler.findOnlinePlayerByName` linear-scans players with
  `toLowerCase` per candidate.** Rate-limited path; index by normalized name
  if private-message volume grows.
- **`ConditionManager.tick` clones the condition object per advancing tick**
  and `project` re-sorts per fight-state send. Small maps, low priority.
- **permessage-deflate is off.** Correct default for many small frames; if
  bandwidth becomes a concern, enable with a ~1–2 KB `threshold` so only
  join/teleport `tile-states` bursts compress, and measure CPU first.

## Client

- **`GameClient` parses every socket frame with `JSON.parse` + zod on the main
  thread.** The big payloads (welcome, depot browse, market lists) could parse
  in a Web Worker. Measure welcome/depot parse time before investing.
- **`WorldRenderer` per-frame loop allocates ~8 short-lived objects per
  creature per frame** (pixel/visual/projected positions, sort position, and
  string tile keys via `elevationAt`). Fix is scratch objects + numeric
  elevation-cache keys + a per-view dirty flag to skip idle creatures.
  Deliberately left out of the optimization pass because it touches the
  renderer's core loop; do it with the headless screenshot harness handy.
- **`MapView.tileItems` recomputes merge+sort per query**; `applyCover` calls
  it repeatedly on every own-player step. Memoize per `tileKey`, invalidated
  by the same events that call `redrawTileKey`.
- **Effects/missiles/floating text now draw above `onTop`-flagged items**
  (archway tops) after moving to the non-sorted transient layer — see
  `todo/03-rendering-and-animation.md` for the recorded deviation.
