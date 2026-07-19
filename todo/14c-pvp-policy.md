# PVP policy

Part of [`14-social-and-houses`](14-social-and-houses.md). Depends on
[`combat`](07-combat.md) execution, [`08b-player-death`](08b-player-death.md)
consequences, and party/guild state from [`14a-parties`](14a-parties.md) and
[`14b-guilds`](14b-guilds.md).

## PVP policy

- [ ] Configure the world type and match pinned skull/unjustified kill,
  protection level, secure mode, party/guild/war exceptions, combat lock,
  frag/sanction timing, and death consequences.
- [ ] Enforce all PVP policy during combat execution and persist/audit sanctions
  where required. Client indicators are projections only.

## Planned file surface

- `server/src/pvp/` with one main export per file; policy as typed data.
- Skull/status projections in visible creature state.

## Required exploit tests

- [ ] PVP restrictions cannot be bypassed with stale party/guild state.
- [ ] Skull/sanction transitions apply exactly once per qualifying event and
  are audited where required.
- [ ] Protection-level and secure-mode rules hold at combat execution time,
  not just in the client UI.

[Back to overview](README.md)
