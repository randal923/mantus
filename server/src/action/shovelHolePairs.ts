/**
 * Closed pile → open hole transforms for the shovel (Canary's `holes` table,
 * minus 867 which already works as a use-activated dropdown, and 21341 whose
 * open form has no decay-back in the catalog). The open ids carry catalog
 * `decay` back to their closed id, so re-closing is automatic. Keep this in
 * sync with MUTABLE_ITEM_IDS in tools/getMapItemSemantics.mjs.
 */
export const SHOVEL_HOLE_PAIRS: ReadonlyMap<number, number> = new Map([
  [593, 594],
  [606, 607],
  [608, 609],
]);

export const OPEN_SHOVEL_HOLE_IDS: ReadonlySet<number> = new Set(
  SHOVEL_HOLE_PAIRS.values(),
);
