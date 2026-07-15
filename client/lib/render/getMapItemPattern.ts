import type { SpritePattern } from "./AssetStore";

interface MapPatternObject {
  px: number;
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

/** Selects map coordinates unless the item pattern represents subtype state. */
export function getMapItemPattern(
  object: MapPatternObject,
  tileX: number,
  tileY: number,
  floor: number,
  hooks: TileHooks,
): SpritePattern {
  if (object.flags.stackable || object.flags.fluidContainer || object.flags.splash) {
    return { x: 0, y: 0, z: 0 };
  }
  if (object.flags.hangable) {
    if (hooks.south && object.px >= 2) return { x: 1, y: 0, z: 0 };
    if (hooks.east && object.px >= 3) return { x: 2, y: 0, z: 0 };
    return { x: 0, y: 0, z: 0 };
  }
  return { x: tileX, y: tileY, z: floor };
}
