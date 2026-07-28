import type { TibiaObject } from "./AssetStore";

/**
 * The pattern-Y passes to draw for an outfit: the base pass plus one per
 * granted addon bit the sprite pack actually carries (`py` = 1 + addon
 * passes — see client/ASSETS.md). Addons are *composited* over the base, so
 * every caller draws these in order rather than picking one.
 */
export function addonPatternYs(
  object: TibiaObject,
  addons: number,
): ReadonlyArray<number> {
  const ys = [0];
  if (object.py > 1 && (addons & 1) === 1) ys.push(1);
  if (object.py > 2 && (addons & 2) === 2) ys.push(2);
  return ys;
}
