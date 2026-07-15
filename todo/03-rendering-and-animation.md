# Rendering, terrain animation, floors, and occlusion

Depends on the complete floor and item metadata in
[`02-map-and-movement.md`](02-map-and-movement.md). This fixes static water,
characters walking under the wrong textures, and floor transitions.

## Animated map items

- [ ] Make the atlas/appearance layer expose every animation phase and timing
  mode instead of always resolving phase zero. The audited client assets
  contain roughly 4,887 animated item types; water examples include ids 622,
  629, and 4597.
- [ ] Add a pure `getItemAnimationPhase(appearance, elapsedMs, instanceSeed)`.
  Initially support the legacy asynchronous 500 ms phase cycle used by static
  environmental items; keep the API ready for enhanced animator metadata.
- [ ] Use a stable per-instance seed for asynchronous animation so every water
  tile is not phase-locked. Synchronized animations use the shared clock.
- [ ] Advance a render clock in Pixi's ticker and swap textures/frames on
  existing sprites. Do not destroy and recreate every animated map sprite on
  each phase.
- [ ] Register/deregister animated items as map regions stream in/out and stop
  ticker work for invisible regions.
- [ ] Eventually decode exact animator phase durations, start phase, loop type,
  sprite patterns, and light data from the matching DAT version.
- [ ] Keep animation visual only. Harmful fields, doors, decay, and item
  transformations are server state with explicit events.

## Floor-aware rendering

- [ ] Select visible floors from the player's z using OTClient's visible-floor
  and cover behavior as the reference. Above-ground and underground rules are
  different.
- [ ] Load every visible region/floor and draw from the highest visible floor
  down to the player's floor using the correct x/y projection shift.
- [ ] Render dynamic items, creatures, missiles, effects, and overlays only on
  their own floor and within the server-authorized view.
- [ ] On stairs/teleports, change floor and camera origin as one coherent
  authoritative update; cancel/rebase client walk interpolation to avoid a
  one-frame wrong-floor ghost.
- [ ] Unload or cache old floor regions with bounded memory.

## Tile and creature draw order

- [ ] Convert OTBM stack positions and DAT flags into explicit render layers:
  ground, ground borders, bottom items, common items, creatures, effects, and
  top items. Do not infer all ordering from source array order.
- [ ] Preserve Tibia's reverse ordering for common stackable objects where
  required. Validate bottom/top flags from the matching DAT/item catalog.
- [ ] Place creatures between common objects and always-on-top objects. Roofs,
  arches, tree canopies, and wall tops should occlude a creature; ordinary
  ground/common decoration should not incorrectly cover it.
- [ ] Apply cumulative item elevation to creature feet, outfits, health bars,
  names, and effects. Cap it according to the chosen client rules.
- [ ] Account for multi-tile/oversized sprites, displacement/anchors, and
  redraw spill into northwest neighbor tiles so a large corpse or canopy is
  neither clipped nor sorted as a one-tile image.
- [ ] Keep nameplates and health bars anchored to the final elevated creature
  position, with deterministic layering between overlapping creatures.

## Planned file surface

- Client assets: extend existing appearance/atlas types with animation and
  exact item-property metadata.
- Client map: `client/game/animation/getItemAnimationPhase.ts`,
  `AnimatedMapItemRegistry.ts`, `getVisibleFloors.ts`, `getTileRenderLayers.ts`,
  and focused changes to current map-region/sprite rendering files.
- Tests/fixtures: small hand-auditable tiles for water, a bottom border, common
  item, creature, arch/top item, elevated parcel, large sprite, surface roof,
  underground floor, and a stair transition.

## Required tests and visual fixtures

- [ ] Unit-test one-, two-, and multi-phase items at phase boundaries,
  synchronized vs asynchronous phases, and stable instance offsets.
- [ ] Verify animated registry cleanup when regions unload.
- [ ] Snapshot or pixel-test the canonical stack-order fixtures.
- [ ] Verify creature/nameplate elevation together on stacked parcels.
- [ ] Verify a creature is behind an arch/canopy but above ground/common items.
- [ ] Verify visible floors and projection before, during, and after stairs.
- [ ] Profile a dense animated-water region; ticker cost must be bounded by
  visible animated items, not every item in the world.

[Back to overview](README.md)
