# Typed world actions

Depends on atomic [`items`](05-items-and-inventory.md) and complete map
semantics. Storage-gated variants (quest doors, one-time storage-keyed
chests, storage-gated teleports/tiles) are NOT part of this unit — they ship
with [`20a-quest-state`](20a-quest-state.md), which is scheduled last in the
backlog. World actions are typed server behaviors, never imported scripts
executed at runtime.

## Typed world actions

- [x] Build a small action registry keyed by item type/action id with explicit
  handlers and schemas. Unknown actions fail closed.
  `server/src/action/WorldActionRegistry.ts` resolves use-map against current
  tile state at execution time (`resolveWorldAction`) and dispatches to
  registered handlers (door, lever, read, rotate); ladder/dropdown map
  actions keep the movement path. Scripted placements (action/unique ids the
  handlers don't consume), door types without imported pair data (house
  doors), and quest doors fail closed with `item-action-failed`. Out-of-view
  use-map probes fall through identically to empty tiles so tile contents
  beyond the viewport cannot be fingerprinted.
- [ ] Implement in increments: doors/key doors/level doors, levers/switches,
  repeatable chests, pressure plates, teleports, fields, readable and
  writeable objects (including map signs via use-map), rope spots,
  holes/shovel, and decay/transforms. Quest doors and one-time
  (storage-keyed) chests are deferred to the quest phase with
  [`20a-quest-state`](20a-quest-state.md); the registry must fail closed on
  those action ids until then.
  - [x] Doors: Canary pairs imported at the pinned commit
    (`tools/importCanaryDoors.mjs` → `content/items/canary-doors.json` →
    catalog `door` field; level requirements from the otservbr startup table
    → `server/data/door-levels.json`). Custom doors toggle; key-variant
    closed doors open unless flagged locked (Canary action ids 101/1001);
    locked doors answer "It is locked."; level doors gate on the imported
    per-position requirement (fail closed when absent) and close behind the
    player via the step-out hook; closing rejects an occupied doorway. Door
    state overlays tile passability/projectile blocking at runtime
    (`overrideMapData` + `DynamicMapItems` tile overrides) since the static
    navigation bitset baked the placed state. Known deviations: opening a
    level door does not relocate the player through it and step-in is not
    re-enforced while it stands open (the auto-close makes tailgating a
    same-tick race only); unlocking a locked door with a key
    (`use-item-with`) needs the storage-bound key tables and ships with
    [`20a-quest-state`](20a-quest-state.md).
  - [x] Levers/switches: bare levers (2772/2773, 9110/9111) toggle through
    the registry; quest-scripted levers (action/unique ids) fail closed
    until 20a.
  - [x] Readable objects: use-map on a readable map item sends `item-text`
    (protocol `itemId` widened to map instance ids); `allowDistanceRead`
    types are readable within view, everything else requires adjacency. Map
    items are read-only for now — writing to map objects (blackboards) has
    no write-map path yet.
  - [ ] Repeatable chests, pressure plates, use-activated teleports, fields,
    rope spots, holes/shovel: not started.
- [ ] Implement use-with tool actions from the 2026-07-18 Canary use-surface
  audit: fishing rod (water whitelist, worm consume, skill-based catch roll,
  fishing skill advance — all server RNG), machete/jungle grass,
  scythe/wheat, pick, crowbar, and the watch (game-time reply). Same
  registry, same execution-time re-checks.
- [x] Support map-item rotation and generic transform-on-use for world items
  (Canary `m_transformOnUse`; ~1007 catalog types carry `rotateTo`) — the
  carried-item rotate path exists, map furniture has no handler.
  Map furniture with `rotateTo` now transforms in place via the registry
  (`planTransformMapItem`: materialize-on-first-mutation, version bump,
  transform audit, tile-state broadcast). Caveat: the Canary
  `m_transformOnUse` appearance flag itself is still not parsed into the
  catalog (0 entries), so use-transforms beyond `rotateTo` chains remain
  unregistered and fail closed.
- [x] Implement use-activated dropdowns (sewer grates, closed trapdoors, large
  holes, grilles): use moves the player one floor down after server-side
  destination checks, mirroring the ladder action in reverse. Identify them in
  the converter as `primaryType === "dropdowns"` without `floorChange`
  (ids 435/7750/21298, 475/8708/21374, 867/7523/7524, 22750) rather than by
  name matching, and emit them as enabled `use` world actions alongside
  ladders. Known deviations from Canary, revisit with the action registry:
  the Oramond sewer grate 21298 drops one floor here but two floors and one
  tile east in Canary's quest script, and dropdowns over a blocked or missing
  tile are disabled at conversion instead of force-teleporting the player the
  way Canary's `FLAG_NOLIMIT` teleport does.
- [ ] At execution re-check current item/version, position, reach, floor/LOS,
  requirements, cooldown, target, destination, and resulting capacity/state.
- [ ] Apply tile/item/quest changes synchronously in the tick and persist every
  coupled durable outcome atomically. Do not await between validation and
  mutation.
- [ ] Filter resulting tile/effect messages through ordinary visibility.
- [ ] Inventory and implement every pinned action, move event, use callback,
  step-in/out, equip/de-equip hook, creature event, and map-scripted
  interaction as typed project-native behavior.

## Planned file surface

- `server/src/action/WorldAction.ts`, `WorldActionRegistry.ts`, and focused
  handler files.
- Action protocol projections and client read/write/action UI.

## Required exploit tests

- [x] Concurrent/replayed use intents on the same world item resolve to
  exactly one outcome (the one-time-chest replay test itself moves to the
  quest phase with [`20a-quest-state`](20a-quest-state.md)).
  `WorldActionRegistry.test.ts`: two players racing one pristine door leave
  exactly one materialized item row with sequential versions.
- [x] Forged action id, target, position, and destination are rejected.
  Covered for the shipped kinds: scripted/unique-id placements, unpaired
  door types, out-of-reach use, and out-of-view probes all fail closed.
- [ ] Door/lever/teleport state remains coherent for simultaneous users.
  Door and lever coverage exists (occupied-doorway close refusal, racing
  uses re-resolve current state); teleports await their use-activated
  implementation.
- [ ] The action parity report reaches zero unsupported registered actions or
  silently ignored action/movement fields.

[Back to overview](README.md)
