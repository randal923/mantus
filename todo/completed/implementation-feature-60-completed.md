# Feature 60 — completed sub-work

PVP-zone tiles and blessing-loss extras, from
[implementation-feature-60.md](../implementation-feature-60.md). The feature
stays **open**: the blessing-loss half waits on Feature 72.

Cross-links: [implementation-feature-60.md](../implementation-feature-60.md) ·
[todo-15.md](../todo-15.md).

---

## 2026-07-25 — pvp-zone tiles wired to the policy

**Problem.** Kills inside designated pvp-zone tiles were supposed to produce no
skull and no frag, but `PvpTracker` hard-coded `inPvpZone: false` with a comment
that the map data had none.

**What was found.** The comment was stale. `tools/convertOtbm.mjs` has always
emitted the OTBM `pvp` tile flag (`1 << 4`) into its zone bitsets,
`loadMapData` reads it, and `MapData.Tile.pvpZone` already carried it — a sample
of the converted otservbr map finds ~7 700 pvp-zone tiles. Only the consumer was
missing, and `resolvePlayerAttackConsequence` and `resolveKillJustification`
already took an `inPvpZone` they were never given.

**What changed.** `World.isPvpZone` exposes the flag. `PvpTracker` supplies it
in both places, reading **both** fighters' tiles at the instant the attack or the
death event executes — so a player who stepped out of the arena since the intent
was queued is no longer covered, and one fighter standing on an arena edge cannot
farm skull-free aggression. `gridMapData` gained a `pvpZones` option so tests can
build arena tiles.

**Files touched.** `server/src/World.ts`, `server/src/pvp/PvpTracker.ts`,
`server/src/gridMapData.ts`.

**How it was verified.** Four cases in `PvpEnforcement.test.ts`: an unprovoked
attack inside a pvp zone assigns no skull; the same attack outside one assigns
white; secure mode and the black-skull restriction are bypassed inside a zone;
and the exemption requires *both* tiles to carry the flag right now.

**Residual risk.** The tile-flag consumption is covered by unit tests over a
synthetic map, not against the converted otservbr arenas.
