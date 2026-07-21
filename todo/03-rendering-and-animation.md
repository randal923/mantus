# Rendering, terrain animation, floors, and occlusion

Depends on the complete floor and item metadata in
[`02-map-and-movement.md`](02-map-and-movement.md). This fixes static water,
characters walking under the wrong textures, and floor transitions.

## Animated map items

- [x] Make the atlas/appearance layer expose every animation phase and timing
  mode instead of always resolving phase zero. The audited client assets
  contain roughly 4,887 animated item types; water examples include ids 622,
  629, and 4597.
- [x] Add a pure `getItemAnimationPhase(appearance, elapsedMs, instanceSeed)`.
  Initially support the legacy asynchronous 500 ms phase cycle used by static
  environmental items; keep the API ready for enhanced animator metadata.
- [x] Use a stable per-instance seed for asynchronous animation so every water
  tile is not phase-locked. Synchronized animations use the shared clock.
- [x] Advance a render clock in Pixi's ticker and swap textures/frames on
  existing sprites. Do not destroy and recreate every animated map sprite on
  each phase.
- [x] Register/deregister animated items as map regions stream in/out and stop
  ticker work for invisible regions.
- [x] Decode exact animator phase durations, start phase, loop type,
  sprite patterns, and light data from the matching DAT version.
- [x] Keep animation visual only. Harmful fields, doors, decay, and item
  transformations are server state with explicit events.

## Floor-aware rendering

- [x] Select visible floors from the player's z using OTClient's visible-floor
  and cover behavior as the reference. Above-ground and underground rules are
  different.
- [x] Load every visible region/floor and draw from the highest visible floor
  down to the player's floor using the correct x/y projection shift.
- [x] Render dynamic items, creatures, missiles, effects, and overlays only on
  their own floor and within the server-authorized view.
- [x] On stairs/teleports, change floor and camera origin as one coherent
  authoritative update; cancel/rebase client walk interpolation to avoid a
  one-frame wrong-floor ghost.
- [x] Unload or cache old floor regions with bounded memory.

## Tile and creature draw order

- [x] Convert OTBM stack positions and DAT flags into explicit render layers:
  ground, ground borders, bottom items, common items, creatures, effects, and
  top items. Do not infer all ordering from source array order.
- [x] Preserve Tibia's reverse ordering for common stackable objects where
  required. Validate bottom/top flags from the matching DAT/item catalog.
- [x] Place creatures between common objects and always-on-top objects. Roofs,
  arches, tree canopies, and wall tops should occlude a creature; ordinary
  ground/common decoration should not incorrectly cover it.
- [x] Apply cumulative item elevation to creature feet, outfits, health bars,
  names, and effects. Cap it according to the chosen client rules.
- [x] Account for multi-tile/oversized sprites, displacement/anchors, and
  redraw spill into northwest neighbor tiles so a large corpse or canopy is
  neither clipped nor sorted as a one-tile image.
- [x] Keep nameplates and health bars anchored to the final elevated creature
  position, with deterministic layering between overlapping creatures.

## Implemented file surface

- Client assets: `AssetStore.ts` exposes normalized legacy/enhanced animation
  metadata; `importTibiaAssets.mjs` preserves enhanced timing, loop/start data,
  top-effect flags, and exact DAT light values. The pinned DAT is legacy
  (`enhancedAnim: false`), so its audited 500 ms timing is supplied explicitly
  at load time without inflating the generated catalog.
- Client map: `getItemAnimationPhase.ts`, `AnimatedMapItemRegistry.ts`,
  `getVisibleFloors.ts`, `getTileRenderLayers.ts`, and focused map/player/world
  rendering changes implement phase swaps, floor projection, merged static and
  dynamic stacks, occlusion, elevation, and bounded region cleanup.
- Effects and missiles have no protocol/runtime producers yet, as documented in
  `02-map-and-movement.md` and assigned to `07-combat.md`. Their appearance
  lookup, render depth, floor authorization, projection, and elevation inputs
  now use the same floor-owned rendering contract; no client-authored combat
  events were introduced.
- Tests/fixtures cover water phase boundaries, registry cleanup/load bounds, a
  bottom border, reversed common items, creature/canopy depth, elevated
  parcels, large sprite spill, surface cover, underground floors, and stairs.

## Required tests and visual fixtures

- [x] Unit-test one-, two-, and multi-phase items at phase boundaries,
  synchronized vs asynchronous phases, and stable instance offsets.
- [x] Verify animated registry cleanup when regions unload.
- [x] Snapshot or pixel-test the canonical stack-order fixtures.
- [x] Verify creature/nameplate elevation together on stacked parcels.
- [x] Verify a creature is behind an arch/canopy but above ground/common items.
- [x] Verify visible floors and projection before, during, and after stairs.
- [x] Profile a dense animated-water region; ticker cost must be bounded by
  visible animated items, not every item in the world.

## Known gaps (2026-07-20 floor/occlusion audit)

Fixed in the audit: liquid grounds were stripped from the static map
(trashholder→mutable misclassification), multi-tile sprite pieces sorted at
the covered tile instead of the anchor, `limitsFloorView` checked every tile
item instead of OTClient's first-stack-thing rule, no cover calculation
underground, and surface viewers could not see down to the ground floor.
Remaining deliberate gaps:

- [ ] `/assets/*` is browser-cached for 24h (next.config headers). Map
  regions and minimap tiles are now cache-busted via the manifest's
  `version` content hash (manifest itself fetched with `cache: "no-cache"`),
  but `objects.json` and the atlas sheets still have no versioning — after
  an asset re-rip users need a hard refresh until those get the same
  treatment.
- [ ] Underground dynamic visibility stays own-floor only: the server sends
  creatures/tile-states for `position.z` when below ground, although the
  client now draws static floors z±2 with OTClient cover rules. OTClient
  shows dynamic entities on all drawn underground floors; extend
  `creaturesVisibleFrom`/`mapItemTilesVisibleFrom`/`canSee` if that parity
  matters.
- [ ] Re-running the map converter changes the world-item seed hash; a dev
  database with persisted world-item deltas from the old `items.bin` makes
  the server throw "persisted world items require reconciliation" at
  startup. `cleanupPartialWorldSeed.ts` refuses once real gameplay data
  exists, and the `items_immutable_identity` trigger blocks rewriting
  `seed_map_version`, so the working dev reconciliation is: verify each
  stale row's seed key still exists in the new `items.bin`, then DELETE the
  rows inside one transaction with `item-destroyed` audit entries (reverts
  those world items to base map state). Done 2026-07-20 for 5 door rows.
  Production needs a first-class reconciliation path (charter rule 12).

[Back to overview](README.md)
