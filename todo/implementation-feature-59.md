# Feature 59 — Combat-logout in-world persistence

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

Shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-59-completed.md).

## Remaining work

- **End-to-end playtest scenario.** Add a `server/src/playtest/scenarios`
  scenario that stages the real exploit: two headless clients fight, the killer
  disconnects before the victim dies, and the frag plus skull are asserted
  against the killer afterwards. The unit suite covers the linger window's
  bookkeeping (`LingeringPlayers.test.ts`) but cannot stage a fight.
- **Item cache during the linger window.** The item cache detaches with the
  session, which is fine only because a player corpse drops nothing today. When
  Feature 32's death loss starts dropping items, the lingering entity must keep
  its inventory attached so a death inside the window drops loot normally.
