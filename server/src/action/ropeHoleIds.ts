/**
 * Canary's `holeId` table (`data-otservbr-global/scripts/lib/register_actions.lua`,
 * pinned commit a879c931) — the open holes a rope pulls *through*: the top
 * visible thing on the floor below is lifted out beside the hole.
 *
 * This is deliberately an exact id list rather than a name match. The map
 * carries hundreds of "lava hole", "tree hole", "small hole" and even
 * "ornate door with a keyhole" pieces that are pure scenery; matching on the
 * word "hole" classified all of them as unsupported rope targets. Keep in
 * sync with ROPE_HOLE_IDS in tools/convertOtbm.mjs, which emits the
 * `rope-hole` map actions this set is the server-side authority for.
 */
export const ROPE_HOLE_IDS: ReadonlySet<number> = new Set([
  294, 369, 370, 385, 394, 411, 412, 413, 432, 433, 435, 482, 483, 594, 595,
  609, 610, 615, 868, 874, 1156, 4824, 7515, 7516, 7517, 7518, 7519, 7520,
  7521, 7522, 7737, 7755, 7762, 7767, 7768, 8144, 8690, 8709, 12203, 12961,
  17239, 19220, 23364,
]);
