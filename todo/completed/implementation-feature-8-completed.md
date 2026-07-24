# Feature 8 — completed

Cross-links: [implementation-feature-8.md](../implementation-feature-8.md) ·
[todo-4.md](../todo-4.md).

---

## 2026-07-24 — onTop overlay above the transient effect layer

**Problem.** Combat effects/missiles/floating text render in a per-floor
transient container added *after* `floor.objects` (so effect spawns avoid a
whole-floor re-sort). That put them above `onTop`-flagged pieces such as archway
tops (`MAP_DEPTH.onTop = 896`), which also lived in `floor.objects`, so a
missile drew *over* an archway top instead of passing beneath it — an accepted
deviation from OTClient occlusion.

**What changed (client-only).**

- `client/lib/render/MapView.ts` — added a fourth per-floor container `onTop`
  (sortableChildren) appended after `transient`, so the floor child order is now
  `[ground, objects, transient, onTop]`. `drawTile` routes `top-item` layer
  pieces into `floor.onTop`; `ground` still goes to `floor.ground`, everything
  else to `floor.objects`. Effects/missiles stay in `transient` (no re-sort per
  spawn) but now draw beneath the onTop overlay, restoring correct occlusion.
  Tile teardown is unchanged — `destroyRenderedTile` destroys tracked sprites,
  which removes them from whatever container they were added to.

**Files touched.** `client/lib/render/MapView.ts`,
`client/lib/render/MapViewOnTopDrawOrder.test.ts` (new).

**Verification.** `client/lib/render/MapViewOnTopDrawOrder.test.ts`: an archway
top and a crate are drawn on a tile and a missile added to the effect layer; the
onTop overlay is ordered after the effect layer (missile occluded by the
archway) and the objects layer before it (missile over the crate), with the
archway sprite in the overlay and the crate in objects. `yarn workspace client
test` → 207 passed; `yarn workspace client typecheck` clean.

**Residual risk.** None significant. onTop pieces already drew above creatures
(zIndex 896 > creature 640 in the shared objects layer), and they still do
(separate overlay above everything); only their relationship to the effect
layer changed. Client-only; no server/protocol impact.
