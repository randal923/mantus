# Feature 59 — completed

Combat-logout in-world persistence, from
[implementation-feature-59.md](../implementation-feature-59.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Lingering entities and carried locks

**Problem.** An in-fight player who disconnected left the world immediately, so
a killer could log out before their victim died and escape the frag and skull —
a PVP-policy integrity hole, not a nicety.

**What changed.** `GameServer.processDisconnects` now branches: a disconnecting
character who is alive and still combat-locked is registered with
`LingeringPlayers` and keeps its `Player` entity in the world, ticking without
input. Only the session-scoped systems detach (npc dialogue, trade, chat, depot
views); the entity stays attackable, killable, and visible, so a death inside
the window runs the normal death path and `applyFragAndSkull` fires as usual.
The whole leave path moved into `GameServer.leaveWorld`, shared by the ordinary
logout, the linger expiry, and the reclaim.

`expireLingeringPlayers` runs inside the tick — never from the socket-close
callback — and closes a window as soon as the combat lock expires, the character
dies, or the entity has already left.

Reconnection during the window goes through `reclaimLingeringPlayer`, called from
`CharacterHandler.handleSelect` *before* the fresh entry loads: the lingering
entity leaves (flushing its damage, so the reloaded character row carries it) and
its remaining `combat-lock` and `pz-lock` durations are handed back and re-applied
to the new player in `enterWorld`. There is therefore never a moment with two
entities for one character, and relogging neither restores health nor sheds the
locks that keep the player out of a protection zone.

**Files touched.** `server/src/LingeringPlayers.ts`,
`server/src/{GameServer,CharacterHandler}.ts`.

**How it was verified.** `LingeringPlayers.test.ts` (6 cases): the window holds
until the 60 s lock expires and the entry is consumed exactly once by the sweep;
death closes it immediately; an entity already gone closes it; a reconnect after
30 s carries 30 s of both locks; a character that never lingered carries
nothing; several lingering characters expire independently.

**Residual risk.** The end-to-end scenario (killer disconnects, victim dies, frag
recorded) is not covered by an automated test: the unit suite has no way to
stage a real fight through the socket harness. The playtest harness
(`server/src/playtest`) is the right place for it — see the feature file. No
items are dropped into a player corpse today (see `TODO.md`), so the linger
window does not yet need the item cache attached.
