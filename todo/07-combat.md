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

- [x] Import and implement condition-backed player spells such as haste,
  strong haste, paralyze, and magic shield. Preserve Canary speed formulas,
  magic-shield capacity/depletion, refresh rules, and dispels before enabling
  them.
- [ ] Implement field/item-creation spells and runes only after field ownership,
  decay, damage ticks, and item creation are atomic and audited where relevant.
- [ ] Implement procedural summon, party, chain, focus, familiar, named-player,
  and vocation-specific callbacks as reviewed server-side TypeScript before
  enabling their imported definitions.
- [ ] Match pinned attack/follow, challenge/taunt, aim-at-target, boss
  difficulty, hazard, encounter, and combat-analyzer interactions through
  bounded intents and server-owned state.
- [ ] Implement conjuring, ammunition/enchantment, cure/dispel, house, levitate,
  rope, find-person/find-fiend, creature illusion, challenge, food, light, and
  every other support callback represented by the pinned spell registrations.
  Conjuring, ammunition/enchantment, cure/dispel, light, and the inventory food
  path are now executable. The random food-creation spell remains a TODO 7
  gap. House spells are blocked by [`13d-houses`](13d-houses.md);
  levitate/rope by [`12b-world-actions`](12b-world-actions.md);
  find-person/find-fiend by [`13e-social-services`](13e-social-services.md);
  party spells by [`13a-parties`](13a-parties.md); familiar/avatar and
  Wheel/animus branches by [`14-optional-features`](14-optional-features.md).
  Creature illusion, challenge/taunt, summons, chains, Monk harmony, focus/
  virtue, and remaining direct callbacks are explicit TODO 7 gaps.
- [ ] Support every static and dynamic combat area, including custom tile
  matrices and direction-dependent areas, without evaluating Lua at runtime.
- [x] Add an explicit ground-targeting cursor for position runes. Selecting a
  position rune arms one bounded tile click; the server still validates range,
  line of sight, target rules, ownership, and revision at execution.
- [x] Add Monk/Exalted Monk only after those vocations exist in the shared
  protocol, progression definitions, character creation, and client UI.
- [ ] Make the generated spell report distinguish examples/non-content from
  registered gameplay definitions and reach zero disabled registered spells,
  runes, ignored formula fields, or unreviewed callbacks.

[Back to overview](README.md)
