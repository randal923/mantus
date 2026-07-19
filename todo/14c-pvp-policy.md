# PVP policy

Part of [`14-social-and-houses`](14-social-and-houses.md). Depends on
[`combat`](07-combat.md) execution, [`08b-player-death`](08b-player-death.md)
consequences, and party/guild state from [`14a-parties`](14a-parties.md) and
[`14b-guilds`](14b-guilds.md).

## PVP policy

- [x] Configure the world type and match pinned skull/unjustified kill,
  protection level, secure mode, party/guild/war exceptions, combat lock,
  frag/sanction timing, and death consequences.
  (Shipped 2026-07-19: `server/src/pvp/`, migration `018_pvp.sql`. Canary
  constants: protection level 7, white 15 min / red 24 h / black 72 h,
  frag windows 4 h/7 d/30 d with 3/5/10 red and 6/10/20 black thresholds,
  60 s combat lock, black-skull 40 hp/0 mana respawn + no damage to
  unmarked; retaliation and justified-avenge rules; per-viewer yellow/orange
  marks never leaked to other viewers.)
  - Deferred: combat-logout in-world persistence (an in-fight player still
    leaves the world on disconnect; a killer logging out before the victim
    dies escapes the frag — fix by keeping the entity in-world until the
    lock expires), pvp-zone tiles (map data has none; modeled as data),
    blessing-loss extras (no blessing system exists).
- [x] Enforce all PVP policy during combat execution and persist/audit sanctions
  where required. Client indicators are projections only.
  (Gates in `canPlayerTarget`/`canPlayerHarm`/`DamageResolver` re-checked
  every attack tick; red/black transitions write `pvp-skull-sanction` audit
  rows exactly once per death event; skulls/frags durable across relogin.)

## Planned file surface

- `server/src/pvp/` with one main export per file; policy as typed data.
- Skull/status projections in visible creature state.

## Required exploit tests

- [x] PVP restrictions cannot be bypassed with stale party/guild state.
  (`pvp/PvpTracker.test.ts`)
- [x] Skull/sanction transitions apply exactly once per qualifying event and
  are audited where required. (`pvp/PvpTracker.test.ts`,
  `pvp/PgPvpStore.integration.test.ts`)
- [x] Protection-level and secure-mode rules hold at combat execution time,
  not just in the client UI. (`pvp/PvpEnforcement.test.ts`)

[Back to overview](README.md)
