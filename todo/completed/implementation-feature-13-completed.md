# Feature 13 — completed

Cross-links: [implementation-feature-13.md](../implementation-feature-13.md) ·
[todo-6.md](../todo-6.md).

---

## 2026-07-24 — Trashholder destruction on drop and throw

**Problem.** 79 catalog types carry `kind: "trashholder"` (dustbins, sewer
grates, water/lava/tar tiles). In Canary an item dropped or thrown onto one is
destroyed with an effect; here it just landed on the tile. The liquids are
static map scenery — there is no world item on the tile — so the behavior must
key off the catalog type of the destination tile at throw time (recorded
2026-07-20), not off a world item.

**What changed (server-authoritative).**

- `server/src/item/plan/isTrashholderTile.ts` (new) — `isTrashholderTile(tileItems,
  catalog)` returns true when any item on the tile has `kind === "trashholder"`.
  `world.getMapItems(position)` returns statics + dynamics, so it sees the
  water/lava ground scenery as well as placed dustbins. Exports
  `TRASH_DESTRUCTION_EFFECT_ID = 3` (Canary's CONST_ME_POFF).
- `server/src/item/plan/planTrashDrop.ts` (new) — builds the destruction plan
  for a carried drop: a partial stack reduces the source and audits only the
  destroyed count; a full drop removes the item and, for a container, deletes
  its whole nested subtree **leaf-first** for the RESTRICT container FK (the
  cache drops descendants by reachability once the root is gone). Every
  destroyed row gets a `destruction` audit with `reason: "trash"` (charter
  rules 2 and 11: single atomic op, audited economy event).
- `server/src/item/plan/planDrop.ts` — after count validation, a trashholder
  destination routes to `planTrashDrop`.
- `server/src/item/plan/planMoveMapItem.ts` — a throw onto a trashholder
  destroys the whole world subtree (persisted rows deleted, memory-only kill
  loot removed without a delete, all audited).
- `server/src/item/CarriedPersistPlan.ts` — `destruction` audit reason widened
  to `"food" | "trash"` (the reason is stored in the audit JSONB; no schema
  change).
- `server/src/item/plan/CarriedPlan.ts` — optional `effect` field; broadcast at
  execution time in `server/src/item/ItemIntentHandler.ts` after the mutation
  applies, so the poff shows on destroy.

**Files touched.** `isTrashholderTile.ts` (new), `planTrashDrop.ts` (new),
`planDrop.ts`, `planMoveMapItem.ts`, `CarriedPlan.ts`, `CarriedPersistPlan.ts`,
`ItemIntentHandler.ts`; tests `planTrashDrop.test.ts` (new),
`ItemIntentHandler.test.ts`, `PgItemStore.integration.test.ts`.

**Verification.**
- `planTrashDrop.test.ts` — full destroy (one delete op, one destruction audit,
  poff effect); partial drop (source reduced, only destroyed count audited);
  container subtree deleted leaf-first.
- `ItemIntentHandler.test.ts` — dropping a carried item onto a water (622) tile
  removes it from the inventory, never places it on the tile, and the row is
  gone after the persist queue drains.
- `PgItemStore.integration.test.ts` — a trash-drop persist deletes the row and
  writes exactly one `item-destroyed` audit with `reason: "trash"` (the
  "destroys exactly once, one audit row" requirement). Ran against local
  Postgres → 38 passed.
- `yarn workspace server test` → 734 passed; `typecheck` clean.

**Residual risk / accepted limitation.** A *pristine* movable static-seed
decoration **thrown** (move-map-item) onto a trashholder is not destroyed — it
falls through to normal placement, because destroying it would leave the static
map seed to reappear on reload (there is no world row to hide, and hiding a seed
is a separate persistence path). This is benign (no dupe, item simply lands
rather than being destroyed) and rare (few movable static-seed items exist). The
common vectors — dropping a carried item and throwing a persisted/loot world
item onto trash — are fully covered. Concurrent drop/throw races are handled by
the existing version-guarded single-owner delete (a losing racer's guard misses
and poisons its own persist, leaving exactly one destruction).
