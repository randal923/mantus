import type { SpritePattern } from "./AssetStore";
import { getStackCountPattern } from "./getStackCountPattern";

interface IconPatternObject {
  px: number;
  py: number;
  flags: { stackable: boolean };
}

/**
 * The pattern cell an item icon draws with. A UI slot has no map position, so
 * — as in OTClient, where `UIItem` draws an item that never entered a tile —
 * the only pattern that applies is a stackable's stack size.
 */
export function getItemIconPattern(
  object: IconPatternObject,
  count: number,
): SpritePattern {
  if (!object.flags.stackable || object.px !== 4 || object.py !== 2) {
    return { x: 0, y: 0, z: 0 };
  }
  const { x, y } = getStackCountPattern(count);
  return { x, y, z: 0 };
}
