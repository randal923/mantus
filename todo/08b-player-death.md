# Player death and penalties

Part of [`08-death-loot-and-decay`](08-death-loot-and-decay.md). Builds on the
shared death transaction from
[`08a-monster-death-and-loot`](08a-monster-death-and-loot.md).

## Player death

- [x] Pinned v1 death penalty implemented and documented
  (`server/src/progression/getDeathExperienceLoss.ts`): lose 10% of total
  experience (floored), level/max-health/max-mana/capacity re-derived, then
  full health/mana restore, temple teleport, and 2s invulnerability.
- [ ] Import the remaining pinned Canary penalties: skill loss, blessings,
  item/container loss, unfair-fight/PVP reductions, and vocation/level
  modifiers. None of these systems exist yet; the v1 rule above is the
  documented stand-in until they land.
- [x] Apply penalties, item ownership changes, and audit events atomically
  before acknowledging the respawn/login state. The penalty and the respawn
  state persist in one character snapshot (`progression.syncPlayer` immediate
  save); the applied-penalty event id is part of the same snapshot. No item
  loss exists yet, so there is no item leg to the transaction.
- [x] Never let a reconnect or duplicate death packet skip or apply a penalty
  twice. Deaths are server-computed (no death packet exists);
  `Creature.claimDeath()` dedupes concurrent lethal events, and the persisted
  progression event id (`death:{uuid}`) blocks replay across reconnects.

## Planned file surface

- Player-death handling inside `server/src/death/`, penalty rules as typed
  data, and persistence/audit additions for applied penalties. (Current
  implementation: `Combat.handleDeath` player branch,
  `Player.applyDeathPenalty`, `CharacterProgression.loseExperience`.)

## Required exploit tests

- [x] Player death penalties are neither skipped nor applied twice on reconnect
  (`CharacterProgression.test.ts`).
- [x] A duplicate death packet or concurrent lethal events cannot apply the
  penalty transaction twice (`Combat.test.ts` "applies the experience death
  penalty exactly once per death").

[Back to overview](README.md)
