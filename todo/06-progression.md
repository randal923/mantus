# Vocations, stats, and progression

Depends on persisted [`characters`](01-characters.md) and the item core for
equipment-derived stats. Progression is server-owned; client bars are display
only.

## Static definitions

- [x] Define typed `Vocation` data for base/promoted vocation, health/mana/cap
  gains, regeneration, attack-speed/formula coefficients, skill/magic-rate
  multipliers, allowed starter options, and client display data.
- [x] Define an explicit `Skill` union and progression curves. Do not use loose
  string keys or execute imported vocation Lua/XML behavior at runtime.
- [x] Version definitions alongside the content manifest and decide how a
  balance-data change affects existing characters.

## Persistent state

- [x] Add character experience/level/magic-level/mana-spent and normalized
  `character_skills(character_id, skill, level, tries)` rows with constraints.
- [ ] Store base/current health, mana, capacity, soul/stamina only where the
  selected game design actually uses them; document regeneration/logout rules.
  Health, mana, capacity, and soul are covered. Pinned Canary stamina is still
  missing, so this checkbox was previously only partially complete.
- [x] Keep derived totals pure and recomputable from vocation, level, skills,
  equipment, and conditions. Do not persist conflicting copies unnecessarily.

## Authoritative runtime

- [x] Award experience, skill tries, and magic progress only from validated
  server events. Cap values and make rewards idempotent where an event can be
  retried.
- [x] Calculate level-ups and stat gains on the server and persist an immutable
  versioned character snapshot after the synchronous tick mutation.
- [x] Apply regeneration and training through bounded tick schedules using the
  server clock and conditions; reconnect cannot manufacture offline ticks.
- [x] Expose the own player's exact status/progress and only the public level or
  vocation fields the design intends for other players.

## Planned file surface

- `server/src/progression/Vocation.ts`, generated vocation definitions,
  `Skill.ts`, `CharacterProgression.ts`, and pure curve/formula utilities.
- Character/skill migration and `CharacterStore` load/save additions.
- Own-player status/progression protocol projection and client status/skills UI.

## Required tests

- [x] Curve boundaries and multi-level gains are deterministic and bounded.
- [x] Duplicate kill/training events cannot award progress twice.
- [x] Invalid/negative/overflow progress never reaches persistence.
- [x] Derived stats match vocation/level/equipment/condition inputs.
- [x] A stale save cannot erase a newer level or skill gain.

## Implemented design decisions

- Definition version 1 is pinned in `content/source-manifest.json`; future
  balance changes add a version instead of editing existing characters'
  derived rules in place.
- Current health, mana, and soul persist. Max health, max mana, capacity, and
  speed are pure derived values. Stamina is not implemented yet and remains a
  required Canary parity item rather than an optional omission.
- Food-backed regeneration and scheduled training are online-only and process at most five
  overdue intervals per server tick. Exact progression is sent only to the
  owning session; the public creature projection exposes none of it.
- The inventory has a collapsible character-details pane. Inventory opens with
  it closed; the edge arrow, top-nav Character button, or `C` hotkey opens it.

## Remaining pinned Canary parity

- [x] Support every pinned vocation and promotion, including Monk/Exalted Monk,
  with exact gains, skill/magic curves, regeneration, attack speed, formulas,
  requirements, and public/private projections.
- [ ] Implement stamina, soul rules, offline and exercise training, blessings,
  skill stages/rates, death-loss interaction, and every persistent progression
  modifier used by pinned Canary content.
  Blessings and death loss are owned by
  [`08b-player-death`](08b-player-death.md). Party-shared training modifiers
  belong to [`13a-parties`](13a-parties.md), and Wheel/animus modifiers to
  [`14-optional-features`](14-optional-features.md). Stamina, exact soul
  eligibility, offline training, exercise training, and configurable skill
  stages remain explicit TODO 6 implementation gaps.
- [ ] Add formula fixtures and aggregate definition checks so every pinned
  progression coefficient is either matched or identified as non-gameplay
  configuration; no balance field may be silently ignored.
  Aggregate vocation count and core Monk coefficient fixtures now exist.
  Vocation PvP coefficients belong to [`13c-pvp-policy`](13c-pvp-policy.md)
  and gem/Wheel coefficients to
  [`14-optional-features`](14-optional-features.md); remaining base
  coefficients still need an exhaustive generated fixture before this closes.

[Back to overview](README.md)
