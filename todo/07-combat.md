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

[Back to overview](README.md)
