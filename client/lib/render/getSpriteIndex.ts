import type { SpritePattern } from "./AssetStore";

interface SpriteLayout {
  width: number;
  height: number;
  layers: number;
  px: number;
  py: number;
  pz: number;
}

export function getSpriteIndex(
  object: SpriteLayout,
  pattern: SpritePattern,
): number {
  const {
    w = 0,
    h = 0,
    l = 0,
    x = 0,
    y = 0,
    z = 0,
    phase = 0,
  } = pattern;
  const patternX = ((x % object.px) + object.px) % object.px;
  const patternY = ((y % object.py) + object.py) % object.py;
  const patternZ = ((z % object.pz) + object.pz) % object.pz;
  return (
    (((((phase * object.pz + patternZ) * object.py + patternY) * object.px +
      patternX) *
      object.layers +
      l) *
      object.height +
      h) *
      object.width +
    w
  );
}
