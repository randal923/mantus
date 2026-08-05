# Gap 1: `set-viewport` triggers a full view resync with no per-session cooldown

**Severity:** medium (availability — security charter rule 10)
**Verified:** 2026-08-05, `server/src/GameServer.ts:1662`, `server/src/Session.ts:263`, `server/src/Visibility.ts:317`

## Evidence

`set-viewport` calls `session.setViewRange` → `visibility.onViewerRangeChanged`,
which runs `reconcileMoverView` + `syncMapItems`. `syncMapItems` materializes
every map-item tile visible from the player (up to a 32×24 multi-floor window,
~25k tile probes) and rebuilds a key set.

`Session.setViewRange` only rejects an *identical* range. A modified client can
alternate between two ranges (`{32,24}` ↔ `{31,24}`) and force a full resync on
every message, bounded only by the global 30 msg/s rate limit — ~30 full-window
rescans per second per connection of pure server CPU, amplified by connection
count.

## Recommended fix

Add a per-session cooldown on viewport changes (the `MovementHandler.walkToReadyAt`
pattern, ~250–500 ms). Legitimate clients change the viewport on window resize;
a cooldown of that size is invisible to them.
