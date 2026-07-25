# Feature 60 — Blessing-loss extras

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

pvp-zone tiles shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-60-completed.md). The map
pipeline needed no change: the OTBM `pvp` flag was already converted and loaded,
only the policy consumer was missing.

## Remaining work

- **Blessing-loss modifiers on death.** Blocked on Feature 72 (blessings).
  `Player.blessings` is a seam that returns 0, so the Feature 32 death-loss
  formula is only reduced by promotion and the unfair-fight reduction today (see
  `TODO.md`). Once blessings ship, the modifier applies inside the Feature 32
  death-consequence path and `server/src/pvp/PvpHooks.ts`.

## Tests

- Kills inside a pvp-zone tile produce no skull and no frag — **done**.
- Zone flag evaluated at execution time of the death event — **done**.

## Dependencies

- Feature 72 (blessings) for the blessing-loss half.
- Feature 32 (death consequences).
