# Map source

`.otbm` files here are converter *input*, not committed (large binaries) and
never served to the browser.

- `otservbr.otbm` — the community-mapped real Tibia world (~184 MB). Source:
  <https://github.com/opentibiabr/canary/releases/download/v3.6.1/otservbr.otbm>

Canary-format OTBM stores **client ids** directly (no `items.otb`). Sprite and
basic collision metadata come from `client/public/assets/objects.json`;
gameplay semantics such as directional floor changes come from the pinned
Canary `items.xml` conversion in `content/canary-item-semantics.json`.

The v3.6.1 map matches Canary's extended Tibia 15.11 client pack. Download
`tibia-8.6-extended.zip` from:

<https://github.com/dudantas/tibia-client/releases/tag/15.11.c9d1cf>

Extract only `Tibia.dat` and `Tibia.spr` here. Copy Canary's matching
`data/items/items.xml` to `map/items.xml`, then build the item semantics,
browser assets, and map:

```sh
yarn items:convert map/items.xml --commit=a879c9312e34381e8eedf397b8ed44510698b689
yarn assets:import
yarn map:convert map/otservbr.otbm
```

`content/source-manifest.json` pins the exact map, DAT, SPR, Canary commit, and
converter versions. Conversion stops before replacing existing outputs if a
source hash is wrong, an OTBM attribute is unsupported or malformed, item
metadata conflicts without an explicit override, or the map references ids
missing from the asset pack. All outputs are built and validated in a staging
directory before publication. Publication uses atomic renames with rollback,
and the server verifies the hashes tying its four files together at startup.

Outputs:

- `client/public/assets/map/<name>/` — a manifest and deterministic region
  JSONs for floors 0 through 15. These contain terrain and immutable visual
  decoration only.
- `server/data/<name>.map.bin` — compact floor-aware navigation sectors:
  presence, collision/path/projectile/cover flags, zones, and ground speed.
- `server/data/<name>.items.bin` — compact placements for server-owned mutable
  and interactive map items. Mutable items never enter the public static
  regions.
- `server/data/<name>.map.json` — runtime metadata, towns/spawn, enabled
  stairs, ramps, holes, teleports and ladder actions, plus hashes for every
  server data file.
- `server/data/<name>.content.json` — server-only OTBM metadata, external
  monster/NPC/house/zone references, waypoints, item attributes/contents, and
  disabled or unresolved actions for later content-system work.

The server revalidates the source tile, final destination, occupancy, timing,
and transition/action at execution time. Scripted action/unique-id transitions
and invalid or absent destinations fail closed in the server-only content
report. Rope and shovel candidates are likewise recorded but disabled until
the authoritative item/action systems implement their tool and quest rules.

Static map regions are intentionally public downloadable terrain. They reveal
immutable world art, not live authoritative state. The server sends mutable
tile items separately in bounded visible/hidden tile-state batches using the
same floor-aware visibility policy as creatures. Effects and missiles must use
that policy when those systems are added.

Movement intents contain cardinal directions, never client destinations.
Diagonal walking is deliberately disabled for now. The server calculates each
accepted step duration from player speed, ground speed, conditions, and its
tick interval; corrections contain only the authoritative position and
revision.

## Asset compatibility checks

The importer and converter guard compatibility two ways:

- **Landmark assertions** (`LANDMARK_IDS` in `tools/convertOtbm.mjs`):
  visually-verified ids (grass 106, void 101, timber wall 1281, street lamp
  2109, …) are checked against `objects.json` before converting; a re-ripped
  asset pack whose ids drifted aborts the conversion instead of producing a
  scrambled map.
- **Complete id coverage:** every map item must exist in `objects.json` or the
  converter exits before replacing the current client and server outputs.
