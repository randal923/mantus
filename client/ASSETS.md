# Tibia asset pack (`public/assets/`)

Sprites and metadata ripped from `Tibia.dat` / `Tibia.spr` (a modern ~12.x-era
client: 30,515 items, 1,070 outfits, 92 effects — classic 7.x/8.x item IDs do
NOT apply). Everything below was verified visually with `tools/spritetool.mjs`.

## Files

- `atlas-0.png` … `atlas-23.png` — 4096×4096 sprite sheets, 120×120 cells of
  34px (32px sprite + 1px padding on each side).
- `atlas-index.json` — the numbers above (`tile`, `pad`, `cell`, `cols`,
  `tilesPerSheet: 14400`, `sheets[]`).
- `objects.json` — every object from the .dat: `{ category, clientId, width,
  height, layers, px, py, pz, phases, flags, sprites[] }`.
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

## Semantics (learned the hard way)

- **Ground items**: `px`/`py` are map-position variation — pick pattern
  `x = tileX % px`, `y = tileY % py` for natural tiling.
- **Non-ground items (walls etc.)**: extra patterns and extra layers are
  *alternate materials/states*, not overlays or variation. Always draw
  **pattern 0, layer 0**, or walls come out as a patchwork of cobble/timber.
- **Outfits**: `px = 4` directions (patternX: 0=N, 1=E, 2=S, 3=W), `py` =
  addons (use 0), `pz` = mount (use 0). Phase 0 = idle, phases 1..n-1 = walk
  cycle. `layers = 2` means layer 1 is the color mask: yellow→head, red→body,
  green→legs, blue→feet; multiply layer-0 RGB by `palette[i]/255`.
- **Effects**: play phases 0..n-1 once (~90ms each).

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
| Outfit: rat / orc / cyclops / demon | 21 / 5 / 22 / 35 |
| Outfit: citizen (colorizable, 9 phases) | 128 (male), 136+ (female) |
| Outfits ≥ ~145 | mostly white = colorizable, need the mask pass |

Framed-window tiles that *look* like floors but aren't: 413, 414, 428, 432, 446.

## Inspecting sprites

```bash
node tools/spritetool.mjs render outfit 128 out.png --x 2 --phase 1
node tools/spritetool.mjs render item 1292 out.png
node tools/spritetool.mjs sheet outfit 1 160        # contact sheet + id grid
node tools/spritetool.mjs tiled 429                 # 4×4 map-pattern preview
```

The game engine (`lib/game/assets.ts`) implements all of the above for
runtime; `tools/spritetool.mjs` is the offline twin for picking new IDs.
