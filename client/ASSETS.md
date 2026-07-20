# Tibia asset pack (`public/assets/`)

Sprites and metadata imported from Canary's extended Tibia 15.11
`Tibia.dat` / `Tibia.spr`: item ids through 51,950, 1,875 outfits, 303
effects, 62 missiles, and 569,684 sprites. The extended files retain the
classic container format but contain modern client ids; ordinary 7.x/8.x
asset packs do **not** match. Everything below was verified with
`client/tools/spritetool.mjs`.

## Files

- `atlas-0.png` … `atlas-39.png` — 4096×4096 sprite sheets, 120×120 cells of
  34px (32px sprite + 1px padding on each side). All 40 sheets are referenced
  by `atlas-index.json`; none are legacy copies from the previous pack.
- `atlas-index.json` — the numbers above (`tile`, `pad`, `cell`, `cols`,
  `tilesPerSheet: 14400`, `sheets[]`).
- `objects.json` — every object from the DAT: `{ category, clientId, width,
  height, layers, px, py, pz, phases, animation?, flags, sprites[] }`, including ground
  border, container, pickup, projectile blocking, floor-change, stack/fluid,
  hook, displacement, elevation, corpse, top-effect, and exact light flags,
  plus source hashes. Format version 2 stores enhanced animator metadata when
  the input DAT contains it.
- `outfit-colors.json` — the 133-entry RGB palette for outfit colorization.

## Atlas addressing

Sprite id `n` (1-based) lives at cell `n - 1`:

```
cell  = n - 1
sheet = floor(cell / 14400)
col   = (cell % 14400) % 120
row   = floor((cell % 14400) / 120)
x     = col * 34 + 1,  y = row * 34 + 1,  size 32×32
```

## Sprite ordering inside an object

`sprites[]` is a flat array ordered fastest-to-slowest:
**w → h → layer → patternX → patternY → patternZ → phase**

```
idx = (((((phase*pz + z)*py + y)*px + x)*layers + l)*height + h)*width + w
```

Multi-tile sprites anchor at the **bottom-right** tile; piece `(w, h)` draws at
offset `(-w*32, -h*32)`. Creatures additionally draw displaced `(-8, -8)`.

## Semantics

- **Ordinary map items**: select `patternX`, `patternY`, and `patternZ` from
  the item's map position. `getSpriteIndex` applies the modulo for
  each dimension. This applies to grounds, walls, and ordinary decorations;
  wall patterns often contain alternating continuation pieces.
- **Special item patterns**: stack counts, fluids, splashes, and hanging
  objects derive their pattern from subtype or wall-hook state instead of map
  position. The OTBM conversion preserves subtype and item attributes in the
  server-only content output; projecting mutable subtype changes to the client
  belongs to the item/rendering systems.
- **Item layers**: draw every layer in order at the same anchor. They are
  pieces of one rendered item, not alternate materials.
- **Outfits**: `px = 4` directions (patternX: 0=N, 1=E, 2=S, 3=W), `py` =
  addons (use 0), `pz` = mount (use 0). Phase 0 = idle, phases 1..n-1 = walk
  cycle. `layers = 2` means layer 1 is the color mask: yellow→head, red→body,
  green→legs, blue→feet; multiply layer-0 RGB by `palette[i]/255`.
- **Effects**: play phases 0..n-1 once (~90ms each).
- **Map-item animation**: this pinned classic-container DAT has no enhanced
  animator block (`profile.enhancedAnim: false`). The runtime therefore exposes
  its exact legacy behavior as an asynchronous 500 ms cycle, with a stable
  per-instance start offset. Enhanced DAT imports preserve timing mode, loop
  count/type, start phase, and every minimum/maximum phase duration.

## Verified client IDs

| What | IDs |
|---|---|
| Grass (plain / purple / yellow flowers) | 106 / 108 / 109 |
| Gray slab pavement (tiles seamlessly) | 429 |
| Framed stone interior floor | 431 |
| Sandstone floor | 423–425 |
| Sand | 231 |
| Dirt | 103 |
| Wood plank floor | 484 |
| Gray cobble wall: vertical / horizontal / pole / NW corner | 1292 / 1295 / 1296 / 1298 |
| White timber-frame walls | 1289–1291 (family ~1279–1301) |
| Red brick walls | 1270–1285 |
| Sandstone (yellow) walls | ~1331–1363 |
| Trees (2×2) | 25134–25136, 25160–25169, 25185–25188 |
| Bushes | 3653, 3696, 5464, 5465 |
| Blood splats (ground decals) | 2693–2698 (2696 = big) |
| Effect: blood spark (hit) | 1 |
| Effect: white puff (death) | 3 |
| Effect: orange explosion | 7 |
| Effect: gray slash burst (exori-style area) | 10 |
| Effect: blue energy ball / lightning strike | 11 / 12 |
| Effect: magic sparkles blue / red / green | 13 / 14 / 15 |
| Effect: fire flame | 16 |
| Effects generally: phase 0 is tiny — judge them at `phases/2` |  |
| Outfit: rat / orc / cyclops / demon | 21 / 5 / 22 / 35 |
| Outfit: citizen (colorizable, 9 phases) | 128 (male), 136+ (female) |
| Outfits ≥ ~145 | mostly white = colorizable, need the mask pass |

Framed-window tiles that *look* like floors but aren't: 413, 414, 428, 432, 446.

## Inspecting sprites

```bash
node client/tools/spritetool.mjs render outfit 128 out.png --x 2 --phase 1
node client/tools/spritetool.mjs render item 1292 out.png
node client/tools/spritetool.mjs sheet outfit 1 160 # contact sheet + id grid
node client/tools/spritetool.mjs tiled 429          # 4×4 map-pattern preview
```

`lib/render/AssetStore.ts` and `lib/render/MapView.ts` implement runtime
selection; `client/tools/spritetool.mjs` is the offline inspector.

## Project UI assets

`public/assets/ui/` contains original presentation assets created for this
project. They are not ripped from Tibia or another game. UI textures should
remain visually quiet behind text, avoid recognizable third-party ornament,
and be stored in a web-optimized format.

- `forged-stone-texture.webp` — seamless warm-black forged stone used beneath
  the CSS gradients and borders on gothic panels and full-screen backdrops.

## Wheel of Destiny art (`public/assets/wheel/`)

Wheel of Destiny UI art ripped from the Tibia client, taken from the
mehah/otclient `modules/game_wheel` data (`data/images/game/wheel/`). Like the
sprite atlases — and unlike `public/assets/ui/` — this is third-party game
art, not original work. Only the images the wheel itself needs were copied
(no gem-atelier / fragment-workshop / preset chrome).

- `backdrop_skillwheel.png` — 522×522 base wheel frame.
- `wheel-vocations/backdrop_skillwheel_{knight,paladin,sorcerer,druid,monk}.png`
  — per-vocation 522×522 overlay (quadrant symbols; perk icons are separate).
- `wheel-colors/<quadrant>/slot1..9/<step>.png` — 522×522 partial-fill
  overlays, one per 10 invested points (slot1: 5 steps … slot9: 20 steps).
- `wheel-colors/<quadrant>/{TopLeft,TopRight,BottonLeft,BottonRight}_1..9.png`
  — hover focus overlays ("Botton" typo is original).
- `wheel-colors/<quadrant>/perkCircle/revelationBg.png` — 178×178 corner disc.
- `wheel-border/<quadrant>/1..9.png` — 522×522 selection border overlays.
- `backdrop_skillwheel_largebonus_*` + `marker_largeperk.png` +
  `marker_skillwheelsocket.png` — corner medallion composition (socket
  backgrounds, lights, front stages 0–3, markers).
- `icons-skillwheel-{mediumperks,smallperks,largeperks,sockets}.png`,
  `icon-skillwheel-vesselresonance-{basic,supreme}.png`,
  `icon-skillwheel-selection.png` — icon sprite sheets.

`lib/wheel/wheelGeometry.ts` is the companion data module: node slice/ring
hit-test geometry, per-node overlay paths, icon positions and per-vocation
sheet clips, all transcribed from the otclient module's
`wheelMenu.otui` / `buttons.lua` / `geometry.lua` / `icons.lua` /
`wheelclass.lua` (source lines cited inline).

## Rebuilding the web assets

Place the matching extended files at `map/Tibia.dat` and `map/Tibia.spr`, then
run:

```bash
yarn assets:import
```

Only those two source files are needed after extraction; the downloaded ZIP
and the rest of the Windows client can be deleted.

The importer validates every object and sprite reference, builds all atlases
in a staging directory, and only replaces the existing generated files after
the complete import succeeds. To validate a pack without generating outputs:

```bash
node tools/importTibiaAssets.mjs --validate-only
```

To replace only `objects.json` while preserving the existing atlases:

```bash
node tools/importTibiaAssets.mjs --metadata-only
```

For a DAT that actually contains OTClient enhanced animator blocks, pass
`--enhanced-animations`; using that flag with a legacy DAT deliberately fails
validation rather than guessing the binary layout.
