# Map semantics, stairs, and multi-floor movement

Depends on persisted [`characters`](01-characters.md). Complete this before
world spawns so positions, collision, visibility, and pathfinding all agree.

## Converted map data

- [x] Extend the OTBM converter to export all floors 0 through 15 for both
  server navigation and client regions. Do not keep the server limited to z=7.
- [x] Decode and preserve item attributes needed for gameplay: unique/action
  ids, text, subtype/count, charges, depot/door data, teleports, and tile flags.
- [x] Merge OTBM item ids with static `items.xml` semantics: blocking,
  projectile blocking, path blocking, ground speed, elevation, stack order,
  floor-change direction, movable/pickupable, container, door, field, and
  hangable behavior.
- [x] Export explicit floor-transition metadata instead of guessing from a
  sprite or walkability at runtime. Include stairs, ladders, ramps, holes,
  rope spots, and teleports, with source and destination rules.
- [x] Classify the converted floor-change items whose Canary-compatible target
  tile is absent. Keep them disabled as unresolved metadata until each is
  identified as a world action, intentional no-op, or corrected content.
- [x] Preserve OTBM references to external monster/NPC spawn files and towns;
  do not assume spawn positions live in the tile tree.
- [x] Classify immutable decoration separately from mutable world items. The
  static region payload may contain the former; the server must seed and own
  the latter.
- [x] Version the generated map format and include source hashes.
- [x] Build into a staging directory and atomically replace the output only
  after all validation passes so a failed conversion cannot leave a mixed
  dataset.
- [x] Fail conversion on unknown required attributes, out-of-range positions,
  asset-era mismatches, duplicate transitions, or invalid destinations.

## Server map and movement architecture

- [x] Introduce one typed `Position` and z-aware key utility shared by map,
  occupancy, visibility, pathfinding, creatures, and protocol projections.
- [x] Replace z=7-specific `MapData` access with `getTile(position)`,
  `isWalkable(position, creature)`, `getGroundSpeed(position)`,
  `blocksProjectile(position)`, and `getTransition(position, direction)`.
- [x] Key occupancy and spatial buckets by x/y/z. Creatures at equal x/y on
  different floors must never collide or observe one another accidentally.
- [x] Keep movement packets as directions/intents, never destinations. During
  the tick re-check adjacency, source ownership, destination walkability,
  occupancy, speed delay, conditions, and transition rules.
- [x] Implement cardinal stairs/ramps using explicit source item/tile metadata
  and Tibia-compatible destination offsets. Support step-up onto a higher floor
  from the adjacent tile and automatic step-down only where the map semantics
  require it.
- [x] Treat ladder, hole, rope, shovel, and teleport activation as server-side
  world actions, not arbitrary client z changes.
- [x] Keep the initial protocol cardinal-only while the authoritative movement
  and correction path is established.
- [x] Add Canary-compatible diagonal movement and bounded auto-walk/path
  intents. Revalidate every step, use the correct diagonal duration, and stop
  on the first stale, blocked, occupied, or otherwise invalid step.
- [x] Calculate walk duration from server speed, ground speed, diagonal factor,
  and conditions. Client animation may predict that duration but cannot decide
  when another step is legal.
- [x] On rejection, send a bounded correction containing the authoritative
  position/revision. Never accept a client coordinate to resynchronize.
- [ ] `MovementRules.tryUseMap` (ladders/sewers) does not apply the pz-lock
  destination check that `tryMoveInternal` enforces, so a pz-locked player can
  enter a protection zone through a ladder/hole transition. Add the same
  `conditions.has("pz-lock")` + destination `protectionZone` rejection there
  (found during the Canary use-surface audit).

## Visibility and security

- [x] Make viewport tests floor-aware. Above ground, visible-floor rules differ
  from underground; walls/cover may reduce which upper floors are rendered.
- [x] Reconcile visibility after every transition: remove creatures no longer
  visible and add only entities visible from the destination floor.
- [x] Filter current dynamic tile state, items, and creatures by one visibility
  policy; no out-of-view or wrong-floor data may be sent. Effects and missiles
  do not exist yet and must join this policy when their systems are added.
- [x] Document whether static map regions are considered public downloadable
  content. If not, authorize and crop region delivery rather than exposing the
  entire world through HTTP.

## Implemented file surface

- Converter: typed OTBM attribute decoding, Canary item-semantic conversion,
  explicit transition/action resolution, generated format validation, and
  focused fixtures in `tools/`.
- Server: z-aware `MapData`, `MapTransition`, `MapAction`, compact generated
  loaders, `SpatialGrid`, `World`, and tick-serialized `MovementHandler`.
- Protocol: strict direction/use intents and revisioned movement, correction,
  and dynamic tile-state messages.
- Client: floor-aware region selection, dynamic tile reconciliation, and
  transition/correction handling. Remaining visual fidelity belongs in
  [`03-rendering-and-animation.md`](03-rendering-and-animation.md).

## Required tests

- [x] Converter fixtures cover ground, borders, blocking items, ground speed,
  subtype/action attributes, every floor-change kind, and invalid data.
- [x] Stairs and ramps resolve correct x/y/z offsets in every direction.
- [x] A forged destination, non-adjacent move, and illegal z change are rejected
  before they can affect authoritative state.
- [x] An early speed replay and blocked floor-transition destination are
  rejected at execution time.
- [x] Simultaneous moves into one destination serialize to one winner.
- [x] Equal x/y on different floors does not collide or leak visibility.
- [x] Reconnect after a floor change restores the authoritative position.
- [x] Static and dynamic map outputs are deterministic for the same manifest.
- [ ] The map/action parity audit resolves every disabled transition, movement
  action, zone behavior, and invalid placement from the pinned source; no
  player-visible map behavior remains silently classified as unsupported.
  Remaining ladder/hole/rope/shovel and scripted movement actions belong to
  [`12b-world-actions`](12b-world-actions.md); house/zone ownership belongs to
  [`13d-houses`](13d-houses.md). They remain disabled rather than accepting a
  client-authored destination.

[Back to overview](README.md)
