# Feature 59 — Combat-logout in-world persistence

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Today an in-fight player who disconnects leaves the world immediately, so a killer can log out before the victim dies and escape the frag/skull sanction. Canary keeps the character in-world until the combat lock expires — this is a PVP-policy integrity hole, not a nicety.

## Remaining work
- Keep a disconnecting in-fight character's entity in the world, ticking without input, until the 60 s combat lock expires; then run the normal save/removal.
- Death while lingering must go through the normal death path so frags/skulls are recorded.
- Reconnect must reattach to the lingering entity (one session per character).

## Implementation
- In session teardown in `server/src/GameServer.ts`/`server/src/World.ts`: when the player has an active combat lock (tracked by `server/src/pvp/PvpTracker.ts`), detach the socket but leave the Player entity in the world ticking (no input) until lock expiry, then normal save/removal.
- Death while lingering goes through the normal death path so `server/src/pvp/applyFragAndSkull.ts` fires and loot drops normally.
- Respect one-session-per-character on reconnect: a new login for that character reattaches to the lingering entity instead of spawning a duplicate.
- All lingering-entity state changes happen inside the tick loop, never from the socket-close callback directly (charter rule 5).

## Tests
- Killer disconnects pre-death → victim dies → frag and skull recorded against the killer.
- A lingering entity can be attacked, killed, and drops loot via the normal death path.
- Reconnect during the linger window reattaches (no duplicate entity, no item dupe).

## Dependencies
- Feature 32 (player death path).
- Session handling (todo-19, Feature 101 area).
