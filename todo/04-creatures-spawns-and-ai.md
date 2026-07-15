# Creatures, world spawns, respawns, and AI

Depends on z-aware [`map/movement`](02-map-and-movement.md) and correct
[`rendering`](03-rendering-and-animation.md). Start with a small starter region;
the audited datapack is far too large to enable without load testing.

## Content import

- [ ] Read the external spawn filenames from the OTBM map-data node. Import
  monster positions from `otservbr-monster.xml` and NPC positions from
  `otservbr-npc.xml`; they are not embedded in the tile tree.
- [ ] Resolve each spawn group's `centerx`, `centery`, `centerz`, and `radius`;
  resolve child x/y offsets to absolute positions and preserve spawn time,
  direction, and other supported placement fields.
- [ ] Normalize names consistently and fail imports when a placement cannot be
  matched to a static type. Produce a report for aliases, duplicates,
  out-of-map positions, blocked tiles, and unsupported definitions.
- [ ] Define a project-native, typed JSON/TypeScript `MonsterType` format
  containing outfit, health, speed, flags, target strategy, attacks, defenses,
  elements, immunities, summons, voices, loot references, experience, and
  corpse id.
- [ ] Never execute Canary Lua. Parse only a whitelisted literal subset offline;
  procedural callbacks must be manually implemented as reviewed TypeScript
  behavior.
- [ ] Import a curated starter-region slice first. Keep the full roughly
  135,000 monster and 2,000 NPC placement output disabled until memory, spawn,
  AI, pathfinding, and tick benchmarks pass.

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

- [ ] Introduce a server-only `Creature` base/domain shape now and make
  `Player`, `Monster`, and `Npc` share id, name, position, direction, speed,
  outfit, health, conditions, and public projection behavior.
- [ ] Generalize world occupancy, spatial queries, visibility enter/move/leave,
  and protocol ids from players-only to `Creature`.
- [ ] Keep exact health, mana, cooldowns, target, AI state, inventory, and loot
  server-only. Other viewers receive only allowed public state such as health
  percentage.
- [ ] Use one id namespace or an explicit kind/id pair so player, monster, and
  NPC ids cannot collide on the client.

## Spawn and respawn runtime

- [ ] Add `SpawnManager` owned by the game tick. It creates/removes creatures
  synchronously and never mutates world state from a timer callback.
- [ ] Track a stable spawn-slot id separately from each live creature instance.
  A slot may have zero or one active creature and a server-clock next-spawn
  deadline.
- [ ] At spawn execution time re-check tile existence, walkability, occupancy,
  region activation, and any nearby-player suppression policy.
- [ ] Choose and document restart semantics: ephemeral respawn timers may reset,
  while persistent bosses/world events need durable state and idempotent jobs.
- [ ] If using region activation, define it semantically: deactivation must not
  heal, duplicate, reroll loot, or let players exploit despawn boundaries.
- [ ] Emit ordinary visibility deltas rather than broadcasting every spawn to
  every connection.

## Minimal AI before combat

- [ ] Run AI decisions on bounded tick schedules with a per-tick work budget;
  do not give each monster its own timer.
- [ ] Implement idle, walk-home/random-walk, acquire visible target, chase,
  lose target, and return-home states before advanced combat behavior.
- [ ] Pathfind on the server's authoritative z-aware walkability grid. Cache or
  bound A* searches, reject paths outside leash/floor rules, and recover when a
  destination becomes occupied.
- [ ] Keep target selection and RNG server-owned and deterministic under a test
  seed. Add combat actions only after [`07-combat.md`](07-combat.md).

## Client

- [ ] Render a generic `CreatureView` by creature kind/outfit/direction and
  animate movement from server transitions.
- [ ] Add names/health percentages without exposing exact monster stats or any
  creature outside visibility.
- [ ] Add a battle list later using only visible creature projections and stable
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

- [ ] Spawn offsets and `centerz` resolve correctly and invalid references fail.
- [ ] One spawn slot never creates duplicate live creatures under repeated ticks.
- [ ] Death schedules one respawn; restart semantics match the documented policy.
- [ ] Occupied/blocked spawn tiles are retried safely without teleporting a
  creature onto another entity.
- [ ] AI cannot walk through blockers, cross floors illegally, or exceed its
  tick work budget/leash.
- [ ] Hidden or wrong-floor creatures are absent from packets and battle lists.
- [ ] Starter-region load/tick/pathfinding benchmarks have explicit budgets
  before expanding imported content.

[Back to overview](README.md)
