# Feature 60 — PVP-zone tiles and blessing-loss extras

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Kills inside designated pvp-zone tiles produce no skull/frag in Canary, but our map conversion currently emits no pvp-zone flags, so the policy cannot see them. Blessing-loss modifiers on death are also pending blessings themselves.

## Remaining work
- Source pvp-zone tile flags from map data (the OTBM conversion currently produces none) and wire them through walkability/zone metadata to `PvpPolicy`.
- Blessing-loss extras once blessings ship (blessings live in Feature 72).

## Implementation
- Extend the OTBM converter (`tools/` map pipeline) to emit the pvp-zone tile flag into the converted map / `server/src/gridMapData.ts` tile metadata.
- Consume the flag in `server/src/pvp/PvpPolicy.ts` and `server/src/pvp/resolvePlayerAttackConsequence.ts`.
- Blessing modifiers apply inside the Feature 32 death-consequence path and `server/src/pvp/PvpHooks.ts` once Feature 72 lands.
- Rerun map conversion artifacts per the map-pipeline conventions (minimap rebuild after convert).

## Tests
- Kills inside a pvp-zone tile produce no skull and no frag, per Canary.
- Zone flag evaluated at execution time of the death event, not cached from attack start.

## Dependencies
- Map pipeline (OTBM converter).
- Feature 72 (blessings) for the blessing-loss half.
- Feature 32 (death consequences).
