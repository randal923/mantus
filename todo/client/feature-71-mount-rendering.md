# Feature 71 (client) — mounted rendering and mount selection

Part of the [client backlog](README.md). Server side shipped:
[done.md record](../done.md).

## Why
Mount ownership, execution-time selection validation, and the
server-authoritative speed bonus all ship. Public creature state carries
`mountLookType` — the mount's own outfit sprite — but `CreatureView` still
draws only the rider, so a mounted player is indistinguishable from an
unmounted one while actually walking faster.

This was left out deliberately rather than half-implemented: it is a renderer
change subject to the pattern/layer rules in `client/ASSETS.md`, and it cannot
be visually verified without running the client.

## Remaining work
- Draw the mount sprite underneath the rider in `CreatureView`.
- Add the mount row to the outfit window (see
  [feature-70-outfit-picker.md](feature-70-outfit-picker.md)); `outfit-select`
  already carries `mountId`, and `outfit-state.mounts` carries each mount's
  `lookType` for the preview and its `speed` for display.

## Implementation
- `CreatureView` today holds a single `Sprite` added to `container`
  (`this.container.addChild(this.sprite, this.attackTarget, this.light)`), and
  the container is `sortableChildren`. A mount needs a second `Sprite` at a
  lower `zIndex`, animated from the same direction and walk phase as the
  rider.
- Mount look types are **ordinary outfit objects** in the pinned assets
  (368–377 for the ten catalogued mounts), so `AssetStore.outfit(lookType)`
  and `getOutfitAnimationFrames` work unchanged — no new asset import.
- Read `client/ASSETS.md` before touching frame selection: outfit objects use
  pattern/layer conventions that are easy to get subtly wrong, and the
  documented client-id table is the reference for spot-checking.
- Mount sprites are **not colourised** by the rider's outfit colours; pass
  `undefined` where the rider passes `outfitColorsFor(...)`.
- `hasAppearance` gates whether a view is rebuilt on state change; it compares
  outfit fields only, so it must also compare `mountLookType` or mounting will
  not visibly take effect until some other appearance field changes.
- `WorldRenderer.loadCreature` preloads the rider's sprites; preload the
  mount's too, or the first mounted frame pops in late.

## Tests
- `CreatureView.test.ts` already exists — assert the mount sprite is added,
  sits below the rider, and disappears when `mountLookType` is absent.
- Assert `hasAppearance` returns false when only `mountLookType` differs.
- Visual check with `/run` or Storybook before calling it done; the automated
  tests cannot catch a wrong pattern index.

## Dependencies
- [feature-70-outfit-picker.md](feature-70-outfit-picker.md) for the selection
  UI. The rendering half can land first and be exercised by granting a mount
  server-side.
