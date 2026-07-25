# Feature 56 — Party finder

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

Shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-56-completed.md).

## Remaining work

- **Wire the real finder-visibility setting.** `PartyHandler` takes a
  `finderVisible(characterId)` hook, consulted at query execution time, that
  currently defaults to true. Feature 65 owns the friend-system privacy setting
  it must read.
