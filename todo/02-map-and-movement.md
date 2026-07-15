# Map semantics, stairs, and multi-floor movement

Depends on persisted [`characters`](01-characters.md). Complete this before
world spawns so positions, collision, visibility, and pathfinding all agree.

## Converted map data

- [ ] Extend the OTBM converter to export all floors 0 through 15 for both
  server navigation and client regions. Do not keep the server limited to z=7.
- [ ] Decode and preserve item attributes needed for gameplay: unique/action
  ids, text, subtype/count, charges, depot/door data, teleports, and tile flags.
- [ ] Merge OTBM item ids with static `items.xml` semantics: blocking,
  projectile blocking, path blocking, ground speed, elevation, stack order,
  floor-change direction, movable/pickupable, container, door, field, and
  hangable behavior.
- [ ] Export explicit floor-transition metadata instead of guessing from a
  sprite or walkability at runtime. Include stairs, ladders, ramps, holes,
  rope spots, and teleports, with source and destination rules.
- [ ] Preserve OTBM references to external monster/NPC spawn files and towns;
  do not assume spawn positions live in the tile tree.
- [ ] Classify immutable decoration separately from mutable world items. The
  static region payload may contain the former; the server must seed and own
  the latter.
- [ ] Version the generated map format and include source hashes. Build into a
  staging directory and atomically replace the output only after all validation
  passes so a failed conversion cannot leave a mixed dataset.
- [ ] Fail conversion on unknown required attributes, out-of-range positions,
  asset-era mismatches, duplicate transitions, or invalid destinations.

## Server map and movement architecture

- [ ] Introduce one typed `Position` and z-aware key utility shared by map,
  occupancy, visibility, pathfinding, creatures, and protocol projections.
- [ ] Replace z=7-specific `MapData` access with `getTile(position)`,
  `isWalkable(position, creature)`, `getGroundSpeed(position)`,
  `blocksProjectile(position)`, and `getTransition(position, direction)`.
- [ ] Key occupancy and spatial buckets by x/y/z. Creatures at equal x/y on
  different floors must never collide or observe one another accidentally.
- [ ] Keep movement packets as directions/intents, never destinations. During
  the tick re-check adjacency, source ownership, destination walkability,
  occupancy, speed delay, conditions, and transition rules.
- [ ] Implement cardinal stairs/ramps using explicit source item/tile metadata
  and Tibia-compatible destination offsets. Support step-up onto a higher floor
  from the adjacent tile and automatic step-down only where the map semantics
  require it.
- [ ] Treat ladder, hole, rope, shovel, and teleport activation as server-side
  world actions, not arbitrary client z changes.
- [ ] Decide diagonal movement deliberately. If enabled, validate the diagonal
  intent and corner constraints and apply the correct duration multiplier.
- [ ] Calculate walk duration from server speed, ground speed, diagonal factor,
  and conditions. Client animation may predict that duration but cannot decide
  when another step is legal.
- [ ] On rejection, send a bounded correction containing the authoritative
  position/revision. Never accept a client coordinate to resynchronize.

## Visibility and security

- [ ] Make viewport tests floor-aware. Above ground, visible-floor rules differ
  from underground; walls/cover may reduce which upper floors are rendered.
- [ ] Reconcile visibility after every transition: remove creatures no longer
  visible and add only entities visible from the destination floor.
- [ ] Filter dynamic tile state, items, effects, missiles, and creatures by the
  same visibility policy; no out-of-view or wrong-floor data may be sent.
- [ ] Document whether static map regions are considered public downloadable
  content. If not, authorize and crop region delivery rather than exposing the
  entire world through HTTP.

## Planned file surface

- Converter: extend `map` conversion code with `OtbmItemAttribute`,
  `ItemTypeFlags`, `FloorTransition`, generated format validation, and fixtures.
- Server: `server/src/world/Position.ts`, `server/src/world/positionKey.ts`,
  `server/src/world/MapData.ts`, `server/src/world/FloorTransition.ts`,
  `server/src/movement/resolveStep.ts`, and z-aware `SpatialIndex`/`World`.
- Protocol: position, direction, floor-change, authoritative correction, and
  world-revision schemas.
- Client: floor-aware region selection and transition handling; rendering work
  belongs in [`03-rendering-and-animation.md`](03-rendering-and-animation.md).

## Required tests

- [ ] Converter fixtures cover ground, borders, blocking items, ground speed,
  subtype/action attributes, every floor-change kind, and invalid data.
- [ ] Stairs and ramps resolve correct x/y/z offsets in every direction.
- [ ] A forged destination, non-adjacent move, early speed replay, blocked
  transition, and illegal z change are rejected at execution time.
- [ ] Simultaneous moves into one destination serialize to one winner.
- [ ] Equal x/y on different floors does not collide or leak visibility.
- [ ] Reconnect after a floor change restores the authoritative position.
- [ ] Static and dynamic map outputs are deterministic for the same manifest.

[Back to overview](README.md)
