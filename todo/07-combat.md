# Combat, spells, and conditions

Depends on [`creatures`](04-creatures-spawns-and-ai.md),
[`items`](05-items-and-inventory.md), and [`progression`](06-progression.md).
The client sends attack/cast intents; every result, formula, cooldown, and RNG
roll is computed by the server.

## Protocol and execution

- [x] Define bounded attack-target and cancel-attack intents before handlers;
  never accept client damage, target coordinates, or other authored outcomes.
- [x] Define bounded fight-mode and cast/use-rune intents before handlers. Never
  accept client hit chance, mana result, random roll, or cooldown completion.
- [x] Enqueue target selection into the game tick and re-check the session
  character, target existence, attackability, visibility, and floor at execution.
- [x] At attack/cast execution re-check range, line of sight,
  weapon/ammunition/rune ownership, mana/soul, cooldown/exhaust, conditions,
  protection zone, and PVP rules.
- [x] Run formulas and seeded RNG server-side, apply the complete synchronous
  in-memory outcome once, then persist dirty state/economy records through the
  correct paths.
- [x] Send outcomes only to observers who can see the event. Exact private stats
  remain restricted to the owning player.

## Combat model

- [x] Define typed damage/healing types, combat origin, area shape, target rules,
  hit block/result, and visual effect/missile ids.
- [x] Implement melee, distance/ammunition, wand/rod, defensive mitigation,
  armor/shielding, elemental resistances/immunities, critical/special effects,
  and healing in small independently tested increments.
- [x] Define typed spell/rune data with vocation/level/magic requirements, cost,
  cooldown groups/exhaust, range/LOS, target/area shape, formula, effect, and
  condition application. Procedural behavior is reviewed TypeScript.
- [x] Implement conditions such as haste/paralyze, poison/fire/energy damage,
  regeneration, invisibility, light, outfit, drunk, mute, and combat/PZ lock
  with server-clock expirations.
- [x] Implement health/mana/spirit potions through a bounded player-target
  intent. The server permits self or adjacent visible players, enforces the
  using character's Canary level/vocation gates, rolls restoration, consumes
  one potion, returns the empty flask in the same audited transaction, and
  applies a separate 1 s potion exhaust. The client supports right-click
  targeting plus a persistent nine-slot Shift+1–9 potion bar with Canary's
  recommended OTClient modes: self, attack target, cursor, and crosshair.
  Fluid containers (vials, casks, drunk/poison fluids) stay with
  [`05-items-and-inventory`](05-items-and-inventory.md).
- [ ] Match Canary's potion-use sound and target `Aaaah...` monster-say once
  item sounds and server-authored creature speech have a shared protocol
  surface. The restorative mechanics and visual magic effect are complete.
- [x] Make condition application/refresh/stack rules explicit and persistent
  only where logout/restart behavior requires it.

## Monster combat AI

- [x] Add target selection, attack scheduling, distance keeping/fleeing,
  retargeting, spell chance, summon limits, and return-home behavior to the
  bounded AI scheduler.
- [x] Revalidate every AI action against current world state just like a player
  intent. A scheduled target can move, die, change floor, or leave visibility.
- [x] Budget pathfinding and spell evaluation per tick; large packs cannot
  monopolize the world loop.

## Client rendering

- [x] Add right-click attack target UI as intent and server state, not authority.
- [x] Add fight mode UI as intent and server state, not authority.
- [x] Render server-sent damage/heal text, magic effects, distance missiles,
  condition icons, cooldown decoration, and creature health changes.
- [x] Clear confirmed target display when the server forgets the creature.
- [x] Reconcile predicted cooldown display after rejection or resync.
- [ ] Add spell artwork for Blank Rune and Conjure Royal Star once the pinned
  OTClient data assigns valid icon indices. Keep their artwork slots empty so
  missing mappings stay visible rather than displaying unrelated artwork.

## Planned file surface

- Server: `server/src/combat/Combat.ts`, `CombatFormula.ts`, `Damage.ts`,
  `Condition.ts`, `ConditionManager.ts`, `Spell.ts`, `SpellRegistry.ts`,
  `CombatIntentHandler.ts`, and combat additions to `MonsterBrain`.
- Protocol/client: combat intents/events, fight state, effect/missile views,
  combat controls, status icons, and combat log.

## Required exploit tests

- [x] Forged, hidden, wrong-floor, and unattackable target ids never change the
  authoritative target.
- [x] Forged damage, range, mana, equipment, cooldown, and spell parameters
  never affect the authoritative outcome.
- [x] Replayed/rapid intents cannot bypass attack speed or exhaust.
- [x] Two lethal hits, damage-over-time, and disconnect races resolve death once.
- [x] Line-of-sight/projectile blockers and protection/PVP rules are enforced at
  execution time.
- [x] Combat events reveal nothing about out-of-view or wrong-floor creatures.
- [x] Seeded formulas, resistance, condition refresh, and expiry are deterministic.

## Pinned Canary parity follow-ups

The generated catalog at `content/spells/canary-spells.json` retains every
definition from Canary commit
`a879c9312e34381e8eedf397b8ed44510698b689`. Direct combat/healing definitions
are enabled only when their formula, target, area, resources, cooldowns, and
visual ids can be represented without executing Lua. The catalog report lists
every disabled definition and reason. Disabled registered content is a
temporary backlog state: pinned parity requires every registered spell and
rune to become executable.

The creature importer audits every registered monster-spell name. The original
pinned world placements contain 276 attack/defense references to 171 distinct
names; the event/callback dependency closure raises that to 285 references in
911 reachable monster types. All 171 now resolve to reviewed typed behavior,
including chains, custom matrices and delayed waves, field creation, dispels,
fear/root, skill reducers, special target rules, magic-wall destruction, and
scripted summons/heals. The generated world report has zero unresolved
`registeredSpell` entries.

- [x] Import and implement condition-backed player spells such as haste,
  strong haste, paralyze, and magic shield. Preserve Canary speed formulas,
  magic-shield capacity/depletion, refresh rules, and dispels before enabling
  them.
- [x] Implement monster-created energy/fire/poison fields with server-owned
  duration, damage ticks, source attribution, and per-monster walking rules;
  destroy-magic-walls removes the pinned magic-wall item ids through the
  authoritative item path. Player field/item-creation runes remain separate.
- [x] Implement every procedural summon, chain, named-monster heal/damage rule,
  reducer, and vocation-specific callback referenced by the reachable monster
  catalog as reviewed server-side TypeScript.
- [ ] Match pinned attack/follow, challenge/taunt, aim-at-target, boss
  difficulty, hazard, encounter, and combat-analyzer interactions through
  bounded intents and server-owned state.
- [ ] Implement conjuring, ammunition/enchantment, cure/dispel, house, levitate,
  rope, find-person/find-fiend, creature illusion, challenge, food, light, and
  every other support callback represented by the pinned spell registrations.
  Conjuring, ammunition/enchantment, cure/dispel, light, and the inventory food
  path are now executable. The random food-creation spell remains a TODO 7
  gap. House spells are blocked by [`14d-houses`](14d-houses.md);
  levitate/rope by [`12-world-actions`](12-world-actions.md);
  find-person/find-fiend by [`14e-social-services`](14e-social-services.md);
  party spells by [`14a-parties`](14a-parties.md); familiar/avatar and
  Wheel/animus branches by [`15-optional-features`](15-optional-features.md).
  Creature illusion, challenge/taunt, player-facing summons and chains, Monk
  harmony, focus/virtue, and remaining player-spell callbacks are explicit
  TODO 7 gaps.
- [ ] Support every static and dynamic combat area, including custom tile
  matrices and direction-dependent areas, without evaluating Lua at runtime.
  The reachable monster catalog now preserves its custom cardinal/diagonal
  matrices; this remaining item covers the disabled player spell catalog.
- [x] Add an explicit ground-targeting cursor for position runes. Selecting a
  position rune arms one bounded tile click; the server still validates range,
  line of sight, target rules, ownership, and revision at execution.
- [x] Add Monk/Exalted Monk only after those vocations exist in the shared
  protocol, progression definitions, character creation, and client UI.
- [ ] Make the generated spell report distinguish examples/non-content from
  registered gameplay definitions and reach zero disabled registered spells,
  runes, ignored formula fields, or unreviewed callbacks.

## Known gaps: combat parity suite (2026-07-21)

The Canary-parity e2e suite (`yarn playtest:spells|weapons|monsters` plus
`combatVisualAssets.test.ts`) exercises every supported spell, the weapon
classes, and monster combat over the real wire. Gaps accepted for now:

- **No vocation promotion path exists**, so the two promoted-only spells
  (`exevo con vis`, `exeta vis`) are skipped in the e2e suite. Fix: implement
  the promotion NPC/mechanic, then drop the skip.
- **`CONDITION_FREEZING` on-hit attack conditions are not imported** (one
  Canary monster); `conditionTypeFor` maps freezing to `paralyze`, which has
  no damage-over-time support. Fix: add a freeze DoT condition type.
- **Monster on-hit conditions apply whenever the ability executes**, even if
  the melee damage itself was fully blocked by armor/shield. Canary gates
  some condition application on the hit landing; verify against Canary
  `Combat::combatDamage` and gate if confirmed.
- **`exura gran sio` is not party-gated** — castRules carry no party
  requirement, so it heals any player target. Canary restricts it to party
  members.

## Known gaps: customizable action bars (2026-07-20)

The spell bar is per-character and player-configured (empty for new
characters; the assignment modal validates and persists slot -> spell id via
`update-action-bar`, stored in `characters.action_bar`). The potion bar stores
its slot -> potion type and target mode configuration in
`characters.potion_action_bar`. Accepted for now:

- The action-bar update acknowledgements are ignored by the client (same
  pattern as `ui-settings-updated`); saves are debounced 800 ms, so an edit
  made right before closing the tab can be lost. Fix: flush the pending update
  on `beforeunload`/disconnect, for the minimap layout too.
- Only `origin: "spell"` entries can be slotted; runes still cast through the
  inventory ground-targeting flow. Fix if wanted: allow rune slots that arm
  the existing rune targeting using the carried item count as the badge.

[Back to overview](README.md)
