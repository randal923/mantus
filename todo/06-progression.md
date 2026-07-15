# Vocations, stats, and progression

Depends on persisted [`characters`](01-characters.md) and the item core for
equipment-derived stats. Progression is server-owned; client bars are display
only.

## Static definitions

- [ ] Define typed `Vocation` data for base/promoted vocation, health/mana/cap
  gains, regeneration, attack-speed/formula coefficients, skill/magic-rate
  multipliers, allowed starter options, and client display data.
- [ ] Define an explicit `Skill` union and progression curves. Do not use loose
  string keys or execute imported vocation Lua/XML behavior at runtime.
- [ ] Version definitions alongside the content manifest and decide how a
  balance-data change affects existing characters.

## Persistent state

- [ ] Add character experience/level/magic-level/mana-spent and normalized
  `character_skills(character_id, skill, level, tries)` rows with constraints.
- [ ] Store base/current health, mana, capacity, soul/stamina only where the
  selected game design actually uses them; document regeneration/logout rules.
- [ ] Keep derived totals pure and recomputable from vocation, level, skills,
  equipment, and conditions. Do not persist conflicting copies unnecessarily.

## Authoritative runtime

- [ ] Award experience, skill tries, and magic progress only from validated
  server events. Cap values and make rewards idempotent where an event can be
  retried.
- [ ] Calculate level-ups and stat gains on the server and persist an immutable
  versioned character snapshot after the synchronous tick mutation.
- [ ] Apply regeneration and training through bounded tick schedules using the
  server clock and conditions; reconnect cannot manufacture offline ticks.
- [ ] Expose the own player's exact status/progress and only the public level or
  vocation fields the design intends for other players.

## Planned file surface

- `server/src/progression/Vocation.ts`, generated vocation definitions,
  `Skill.ts`, `CharacterProgression.ts`, and pure curve/formula utilities.
- Character/skill migration and `CharacterStore` load/save additions.
- Own-player status/progression protocol projection and client status/skills UI.

## Required tests

- [ ] Curve boundaries and multi-level gains are deterministic and bounded.
- [ ] Duplicate kill/training events cannot award progress twice.
- [ ] Invalid/negative/overflow progress never reaches persistence.
- [ ] Derived stats match vocation/level/equipment/condition inputs.
- [ ] A stale save cannot erase a newer level or skill gain.

[Back to overview](README.md)
