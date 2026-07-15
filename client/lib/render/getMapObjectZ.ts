const COORDINATE_STRIDE = 65_536;
const TILE_STRIDE = 1_024;

/**
 * Matches Tibia's diagonal tile traversal: x+y diagonals first, then x from
 * west to east within a diagonal. `stack` orders things on the same tile.
 */
export function getMapObjectZ(x: number, y: number, stack: number): number {
  const tileOrder = (x + y) * COORDINATE_STRIDE + x;
  return tileOrder * TILE_STRIDE + stack;
}
