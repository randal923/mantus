# Combat, spells, and conditions

Depends on [`creatures`](04-creatures-spawns-and-ai.md),
[`items`](05-items-and-inventory.md), and [`progression`](06-progression.md).
The client sends attack/cast intents; every result, formula, cooldown, and RNG
roll is computed by the server.

## Protocol and execution

- [ ] Define bounded attack-target, cancel-attack, fight-mode, and cast/use-rune
  intents before handlers. Never accept client damage, hit chance, mana result,
  random roll, cooldown completion, or target coordinates without validation.
- [ ] Enqueue combat intents into the game tick. At execution time re-check
  session character, target existence/visibility, floor, range, line of sight,
  weapon/ammunition/rune ownership, mana/soul, cooldown/exhaust, conditions,
  protection zone, and PVP rules.
- [ ] Run formulas and seeded RNG server-side, apply the complete synchronous
  in-memory outcome once, then persist dirty state/economy records through the
  correct paths.
- [ ] Send outcomes only to observers who can see the event. Exact private stats
  remain restricted to the owning player.

## Combat model

- [ ] Define typed damage/healing types, combat origin, area shape, target rules,
  hit block/result, and visual effect/missile ids.
- [ ] Implement melee, distance/ammunition, wand/rod, defensive mitigation,
  armor/shielding, elemental resistances/immunities, critical/special effects,
  and healing in small independently tested increments.
- [ ] Define typed spell/rune data with vocation/level/magic requirements, cost,
  cooldown groups/exhaust, range/LOS, target/area shape, formula, effect, and
  condition application. Procedural behavior is reviewed TypeScript.
- [ ] Implement conditions such as haste/paralyze, poison/fire/energy damage,
  regeneration, invisibility, light, outfit, drunk, mute, and combat/PZ lock
  with server-clock expirations.
- [ ] Make condition application/refresh/stack rules explicit and persistent
  only where logout/restart behavior requires it.

## Monster combat AI

- [ ] Add target selection, attack scheduling, distance keeping/fleeing,
  retargeting, spell chance, summon limits, and return-home behavior to the
  bounded AI scheduler.
- [ ] Revalidate every AI action against current world state just like a player
  intent. A scheduled target can move, die, change floor, or leave visibility.
- [ ] Budget pathfinding and spell evaluation per tick; large packs cannot
  monopolize the world loop.

## Client rendering

- [ ] Add attack target/fight mode UI as intents and server state, not authority.
- [ ] Render server-sent damage/heal text, magic effects, distance missiles,
  condition icons, cooldown decoration, and creature health changes.
- [ ] Reconcile predicted target/cooldown display after rejection or resync.

## Planned file surface

- Server: `server/src/combat/Combat.ts`, `CombatFormula.ts`, `Damage.ts`,
  `Condition.ts`, `ConditionManager.ts`, `Spell.ts`, `SpellRegistry.ts`,
  `CombatIntentHandler.ts`, and combat additions to `MonsterBrain`.
- Protocol/client: combat intents/events, fight state, effect/missile views,
  combat controls, status icons, and combat log.

## Required exploit tests

- [ ] Forged damage, target id, range, floor, mana, equipment, cooldown, and
  spell parameters never affect the authoritative outcome.
- [ ] Replayed/rapid intents cannot bypass attack speed or exhaust.
- [ ] Two lethal hits, damage-over-time, and disconnect races resolve death once.
- [ ] Line-of-sight/projectile blockers and protection/PVP rules are enforced at
  execution time.
- [ ] Combat events reveal nothing about out-of-view or wrong-floor creatures.
- [ ] Seeded formulas, resistance, condition refresh, and expiry are deterministic.

[Back to overview](README.md)
