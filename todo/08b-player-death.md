# Player death and penalties

Part of [`08-death-loot-and-decay`](08-death-loot-and-decay.md). Builds on the
shared death transaction from
[`08a-monster-death-and-loot`](08a-monster-death-and-loot.md).

## Player death

- [ ] Import and document pinned Canary death penalties: temple position,
  health/mana restore, experience/skill loss, blessings, item/container loss,
  unfair-fight/PVP rules, protection behavior, and all vocation/level modifiers.
- [ ] Apply penalties, item ownership changes, and audit events atomically before
  acknowledging the respawn/login state.
- [ ] Never let a reconnect or duplicate death packet skip or apply a penalty
  twice.

## Planned file surface

- Player-death handling inside `server/src/death/`, penalty rules as typed
  data, and persistence/audit additions for applied penalties.

## Required exploit tests

- [ ] Player death penalties are neither skipped nor applied twice on reconnect.
- [ ] A duplicate death packet or concurrent lethal events cannot apply the
  penalty transaction twice.

[Back to overview](README.md)
