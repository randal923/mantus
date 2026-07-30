import type { SpritePattern } from "./AssetStore";
import { getStackCountPattern } from "./getStackCountPattern";

interface MapPatternObject {
  px: number;
  py: number;
  flags: {
    stackable: boolean;
    fluidContainer: boolean;
    splash: boolean;
    hangable: boolean;
  };
}

interface TileHooks {
  south: boolean;
  east: boolean;
}

/**
 * The pattern cell one map item draws with, following `Item::updatePatterns`:
 * a stack's size, a hanging decoration's hook, otherwise the tile coordinates
 * that give grounds and scenery their variation. Splashes and fluid containers
 * pattern by their fluid subtype, which the protocol does not carry yet, so they
 * stay on the first cell.
 */
export function getMapItemPattern(
  object: MapPatternObject,
  tileX: number,
  tileY: number,
  floor: number,
  hooks: TileHooks,
  count = 1,
): SpritePattern {
  if (object.flags.stackable) {
    if (object.px !== 4 || object.py !== 2) return { x: 0, y: 0, z: 0 };
    const { x, y } = getStackCountPattern(count);
    return { x, y, z: 0 };
  }
  if (object.flags.fluidContainer || object.flags.splash) {
    return { x: 0, y: 0, z: 0 };
  }
  if (object.flags.hangable) {
    if (hooks.south && object.px >= 2) return { x: 1, y: 0, z: 0 };
    if (hooks.east && object.px >= 3) return { x: 2, y: 0, z: 0 };
    return { x: 0, y: 0, z: 0 };
  }
  return { x: tileX, y: tileY, z: floor };
}
