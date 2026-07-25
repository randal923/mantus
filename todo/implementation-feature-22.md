# Feature 22 — Spell artwork for Blank Rune and Conjure Royal Star

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

Client-only artwork gap: the pinned OTClient data lacks valid icon indices for these two spells. Slots stay deliberately empty until the data assigns valid indices — never invent indices.

## Remaining work

- When a pinned OTClient data update assigns valid icon indices for Blank Rune and Conjure Royal Star, map them into the client spell-icon assets.

**Re-verified 2026-07-25** against the pinned OTClient checkout
(`bdea0b23b4a738809d698cb7e4f88a299dd6bffc`,
`modules/gamelib/spells.lua`): `Conjure Royal Star` (`exevo gran con grav`) is
present but carries `icon = ''` and `clientId = 0`, and `Blank Rune`
(`adori blank`) has no entry at all. Neither appears in
`client/lib/combat/getSpellIconArtwork.ts`, and both slots stay deliberately
empty — `getSpellIconArtwork` returns `undefined` and the list renders without
artwork. Still blocked; do not invent indices.

## Implementation

- Client asset mapping only, via the spell-icon import path — see `/home/randal/code/tibia/tools/importOtclientCyclopediaAssets.mjs`. No server work.

## Tests

- None beyond the existing asset-import checks; verify the two icons render once mapped.

## Dependencies

- Pinned OTClient data update (external).
