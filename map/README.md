# Map source

`.otbm` files here are converter *input*, not committed (large binaries) and
never served to the browser.

- `otservbr.otbm` — the community-mapped real Tibia world (~184 MB). Source:
  <https://github.com/opentibiabr/canary/releases/download/v3.6.1/otservbr.otbm>

Canary-format OTBM stores **client ids** directly (no `items.otb`); item
semantics come from `client/public/assets/objects.json`.

The v3.6.1 map matches Canary's extended Tibia 15.11 client pack. Download
`tibia-8.6-extended.zip` from:

<https://github.com/dudantas/tibia-client/releases/tag/15.11.c9d1cf>

Extract only `Tibia.dat` and `Tibia.spr` here, then build the browser assets
and convert the map:

```sh
yarn assets:import
yarn map:convert map/otservbr.otbm
```

Conversion stops before replacing existing outputs if the map references item
ids missing from the asset pack. Use a map and asset pack from the same client
version.

Outputs:

- `client/public/assets/map/<name>/` — gitignored manifest + per-floor region
  JSONs the client streams over HTTP for rendering. Regenerate these after
  pulling.
- `server/data/<name>.map.bin` + `<name>.map.json` — walkability sectors and
  spawn metadata the game server loads at boot. These compact runtime files
  are committed so CI deployments include them in the server image.

## Asset compatibility checks

The importer and converter guard compatibility two ways:

- **Landmark assertions** (`LANDMARK_IDS` in `tools/convertOtbm.mjs`):
  visually-verified ids (grass 106, void 101, timber wall 1281, street lamp
  2109, …) are checked against `objects.json` before converting; a re-ripped
  asset pack whose ids drifted aborts the conversion instead of producing a
  scrambled map.
- **Complete id coverage:** every map item must exist in `objects.json` or the
  converter exits before replacing the current client and server outputs.
