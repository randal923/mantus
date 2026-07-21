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
    → `server/data/door-levels.json`, falling back to validated OTBM
    `actionId - 1000` requirements when a position has no startup override).
    Custom doors toggle; key-variant
    closed doors open unless flagged locked (Canary action ids 101/1001);
    locked doors answer "It is locked."; level doors gate on the startup
    position override or embedded map action id (fail closed when both are
    absent) and close behind the player via the step-out hook; closing rejects
    an occupied doorway. Door
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
    until 20a. Fixed 2026-07-21: bare levers were baked draw-only on the
    real map (not movable, no actionId → never server-owned), so the
    handler never saw them — 416 map levers silently did nothing. Lever
    ids are now in `MUTABLE_ITEM_IDS` (tools/getMapItemSemantics.mjs) and
    every map lever is a server-owned item.
  - [x] Readable objects: use-map on a readable map item sends `item-text`
    (protocol `itemId` widened to map instance ids); `allowDistanceRead`
    types are readable within view, everything else requires adjacency. Map
    items are read-only for now — writing to map objects (blackboards) has
    no write-map path yet.
  - [x] Rope spots (2026-07-21): right-clicking a rope/elvenhair rope shows
    the Tibia crosshair (`useKind: "useWith"` → `use-item-with`); the
    converter emits enabled `rope-spot`/`use-with` map actions from Canary's
    `ropeSpots` ground ids (1498 on otservbr) and `ToolUseHandler` +
    `World.tryUseRopeSpot` re-validate tool ownership, adjacency, occupancy,
    and step cooldown at execution time. Deferred, with reasons:
    - Rope on open holes (Canary `holeId` list: pulling players/items up
      from the floor below) — needs a pull-through-floor move for arbitrary
      creatures/items; the name-matched `rope-or-shovel` converter actions
      stay disabled because that list is noisy (lava/tree holes).
    - ~~Shovel on closed holes~~ shipped 2026-07-21: 593/606/608 piles are
      mutable server-owned items (`MUTABLE_ITEM_IDS` in
      `getMapItemSemantics.mjs`); the shovel transforms pile → open hole
      (`SHOVEL_HOLE_PAIRS`), drops the digger a floor
      (`MovementHandler.handleHoleFall`), catalog decay re-closes the hole,
      and other players stepping on the open hole fall via the dynamic
      transition layer (`DynamicMapItems.getHoleTransition`, consulted by
      `overrideMapData.getTransition`). Deviations from Canary, with
      reasons: 867 stays a use-activated dropdown (competing behaviors on
      one id); 21341 excluded (its open form 21342 has no catalog
      decay-back, holes would stay open forever); Dawnport's 7749 tutorial
      pile is quest-storage-gated in Canary and waits for 20a; shovel sand
      digging (231: scarab coins/scarab spawns, quest digs) needs loot RNG
      + spawn hooks; monsters/NPCs never fall through holes (matches
      Canary's player-only transitions).
    - Tools are a curated id list (`getToolDefinition`), not the DAT
      `multiUse`/`usable` appearance bits — `importTibiaAssets.mjs` parses
      but drops those flags; capturing them means regenerating
      `objects.json` against the pinned source manifest.
    - Use-with only works on carried tools targeting map tiles; using a
      tool lying on the ground, or targeting a creature/inventory item
      (fluid containers), has no path yet.
  - [ ] Repeatable chests, pressure plates, use-activated teleports, fields:
    not started.
  - [x] Quest doors now answer with Tibia's "The door seems to be sealed
    against unwanted intruders." instead of a generic failure (2026-07-21);
    they still stay shut until 20a-quest-state. Locked key doors around the
    Darashia dragon lair (5115/5124) carry no lock actionId in the OTBM, so
    no key can open them even in Canary — they are quest-script territory,
    not a bug.
  - [x] Look (left+right click) shipped 2026-07-21, fully client-side: the
    client already renders every tile's stack, so `MapView.lookItemIds` +
    the generated `client/public/assets/look-items.json` (built by
    `tools/buildLookCatalog.mjs`, chained into `items:catalog`) resolve
    "You see ..." lines into the combat log with zero new protocol surface.
    Deferred: the DAT `ignoreLook` flag is not parsed, so look picks the
    top-rendered item even where Tibia would skip it; creature look shows
    the name only (no level/vocation — the client is not sent them); no
    shift+left-click alias.
  - [x] Ctrl+click action menu (2026-07-21): Ctrl+left or Ctrl+right click
    on the canvas opens a cursor-anchored menu (`ui/ContextMenu.tsx`,
    `GameMapContextMenu.tsx`) — Look always; Attack/Stop Attack on
    monsters/players; Use on tiles — matching OTClient's classic-control
    Ctrl+right-click thing menu, and covering laptops where left+right
    simultaneous click is impossible (macOS Ctrl+click fires contextmenu
    natively). Deferred: no Use with…/Trade/Follow/Talk entries yet;
    inventory slots keep direct right-click actions (no menu).
  - [x] Multi-tile sprite click fix (2026-07-21): 2x2 items (dungeon gates
    5283/5285, large furniture) anchor on one tile but draw over four, so
    grid-mapped clicks missed them (the Darashia dragon-lair gate was
    unopenable from 3 of its 4 visible quarters). `resolveInteractiveTile`
    (client/lib/render/) redirects use-map, double-click, look, and the
    ctrl menu to the south-east anchor when the clicked tile has no
    prominent item of its own. Walking and crosshair targeting stay on the
    raw clicked tile. Deferred: pixel-perfect hit-testing (elevation and
    displacement offsets are still not reversed on click). Refined
    2026-07-21: covering multi-tile sprites now win over the clicked tile's
    own 1x1 scenery (the Darashia dragon-tower gates of expertise sit next
    to ornamented walls that blocked the redirect), and look/door/status
    feedback shows center-screen (yellow look text, white status) instead
    of only in the 6-line combat log — silent failures were
    indistinguishable from broken doors.
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
  unregistered and fail closed. Known gap (2026-07-21 audit): 181
  rotatable-but-immobile types (ship's telescopes, built-in drawers) stay
  baked draw-only — only 42 instances map-wide, so rotate silently does
  nothing on them; promote via `MUTABLE_ITEM_IDS` if it ever matters.
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
