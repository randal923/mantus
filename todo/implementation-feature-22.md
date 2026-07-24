# Feature 22 — Spell artwork for Blank Rune and Conjure Royal Star

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

Client-only artwork gap: the pinned OTClient data lacks valid icon indices for these two spells. Slots stay deliberately empty until the data assigns valid indices — never invent indices.

## Remaining work

- When a pinned OTClient data update assigns valid icon indices for Blank Rune and Conjure Royal Star, map them into the client spell-icon assets.

## Implementation

- Client asset mapping only, via the spell-icon import path — see `/home/randal/code/tibia/tools/importOtclientCyclopediaAssets.mjs`. No server work.

## Tests

- None beyond the existing asset-import checks; verify the two icons render once mapped.

## Dependencies

- Pinned OTClient data update (external).
