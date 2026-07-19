# Creatures, world spawns, respawns, and AI

Depends on z-aware [`map/movement`](02-map-and-movement.md) and correct
[`rendering`](03-rendering-and-animation.md). The full audited datapack is
enabled through bounded spatial activation after load and tick benchmarks.

## Content import

- [x] Read the external spawn filenames from the OTBM map-data node. Import
  monster positions from `otservbr-monster.xml` and NPC positions from
  `otservbr-npc.xml`; they are not embedded in the tile tree.
- [x] Resolve each spawn group's `centerx`, `centery`, `centerz`, and `radius`;
  resolve child x/y offsets to absolute positions and preserve spawn time,
  direction, and other supported placement fields.
- [x] Normalize names consistently and fail imports when a placement cannot be
  matched to a static type. Produce a report for aliases, duplicates,
  out-of-map positions, blocked tiles, and unsupported definitions.
- [x] Define a project-native, typed JSON/TypeScript `MonsterType` format
  containing outfit, health, speed, flags, target strategy, attacks, defenses,
  elements, immunities, summons, voices, loot references, experience, and
  corpse id.
- [x] Never execute Canary Lua. Parse only a whitelisted literal subset offline;
  procedural callbacks must be manually implemented as reviewed TypeScript
  behavior.
- [x] Import a curated starter-region slice first, then enable all 84,294
  imported world placements after memory, spawn, AI, pathfinding, and tick
  benchmarks pass.

```ts
interface SpawnSlotDefinition {
  id: string;
  typeId: string;
  home: Position;
  radius: number;
  respawnMs: number;
  direction: Direction;
}

interface MonsterType {
  id: string;
  name: string;
  outfit: Outfit;
  maxHealth: number;
  speed: number;
  experience: number;
  corpseItemTypeId: number;
  // Typed combat, resistance, voice, summon, and loot definitions follow.
}
```

## Shared creature runtime

- [x] Introduce a server-only `Creature` base/domain shape now and make
  `Player`, `Monster`, and `Npc` share id, name, position, direction, speed,
  outfit, health, conditions, and public projection behavior.
- [x] Generalize world occupancy, spatial queries, visibility enter/move/leave,
  and protocol ids from players-only to `Creature`.
- [x] Keep exact health, mana, cooldowns, target, AI state, inventory, and loot
  server-only. Other viewers receive only allowed public state such as health
  percentage.
- [x] Use one id namespace or an explicit kind/id pair so player, monster, and
  NPC ids cannot collide on the client.

## Spawn and respawn runtime

- [x] Add `SpawnManager` owned by the game tick. It creates/removes creatures
  synchronously and never mutates world state from a timer callback.
- [x] Track a stable spawn-slot id separately from each live creature instance.
  A slot may have zero or one active creature and a server-clock next-spawn
  deadline.
- [x] At spawn execution time re-check tile existence, walkability, occupancy,
  region activation, and any nearby-player suppression policy.
- [x] Choose and document restart semantics: ephemeral respawn timers may reset,
  while persistent bosses/world events need durable state and idempotent jobs.
- [x] If using region activation, define it semantically: deactivation must not
  heal, duplicate, reroll loot, or let players exploit despawn boundaries.
- [x] Emit ordinary visibility deltas rather than broadcasting every spawn to
  every connection.

## Minimal AI before combat

- [x] Run AI decisions on bounded tick schedules with a per-tick work budget;
  do not give each monster its own timer.
- [x] Implement idle, walk-home/random-walk, acquire visible target, chase,
  lose target, and return-home states before advanced combat behavior.
- [x] Pathfind on the server's authoritative z-aware walkability grid. Cache or
  bound A* searches, reject paths outside leash/floor rules, and recover when a
  destination becomes occupied.
- [x] Keep target selection and RNG server-owned and deterministic under a test
  seed. Add combat actions only after [`07-combat.md`](07-combat.md).

## Client

- [x] Render a generic `CreatureView` by creature kind/outfit/direction and
  animate movement from server transitions.
- [x] Add names/health percentages without exposing exact monster stats or any
  creature outside visibility.
- [x] Add a battle list later using only visible creature projections and stable
  domain ids.

## Planned file surface

- Content: `content/monsters/`, `content/spawns/`, import script and validation
  report under the existing map/content tooling.
- Server: `server/src/creature/Creature.ts`, `Monster.ts`, `MonsterType.ts`,
  `server/src/spawn/SpawnDefinition.ts`, `SpawnManager.ts`,
  `server/src/ai/MonsterBrain.ts`, `server/src/pathfinding/findPath.ts`.
- Protocol/client: creature-kind public projections, visibility deltas,
  `client/game/creatures/CreatureView.ts`, and battle-list state.

## Required tests

- [x] Spawn offsets and `centerz` resolve correctly and invalid references fail.
- [x] One spawn slot never creates duplicate live creatures under repeated ticks.
- [x] Death schedules one respawn; restart semantics match the documented policy.
- [x] Occupied/blocked spawn tiles are retried safely without teleporting a
  creature onto another entity.
- [x] AI cannot walk through blockers, cross floors illegally, or exceed its
  tick work budget/leash.
- [x] Hidden or wrong-floor creatures are absent from packets and battle lists.
- [x] Full-world load/tick/pathfinding benchmarks enforce explicit placement,
  spatial scan, AI work, and timing budgets.

## Remaining pinned Canary parity

- [ ] Extend `MonsterType`, `NpcType`, and the importers until every ignored
  gameplay assignment and procedural callback in the world import report is
  represented as typed data or reviewed TypeScript behavior. This includes
  race/bestiary/bosstiary metadata, light/mana, target changes, forge and
  reward-boss classifications, event hooks, and special summon/death behavior.
  Static mana cost, light, target-change rules, hidden health, and static-attack
  chance are now typed. Loot/corpse/death/reward-boss callbacks are owned by
  [`08-death-loot-and-decay`](08-death-loot-and-decay.md), NPC behavior by
  [`10-npcs`](10-npcs.md), creature/world event hooks by
  [`12-world-actions`](12-world-actions.md), and
  bestiary/bosstiary/forge classifications by
  [`15-optional-features`](15-optional-features.md).
- [ ] Resolve every duplicate/ambiguous definition, blocked/out-of-map
  placement, appearance correction, and intentionally invisible creature
  individually. Keep valid variants addressable instead of choosing one by
  filename accident.
- [ ] Add aggregate parity tests for definition and placement counts and require
  zero unreviewed creature/NPC gameplay fields or callbacks before marking the
  pinned creature workstream complete.
  Aggregate tests currently pin 897 monster types, 956 NPC types, 83,286
  monster placements, and 1,008 NPC placements. The zero-gap clause remains
  blocked by the owners above.

[Back to overview](README.md)
