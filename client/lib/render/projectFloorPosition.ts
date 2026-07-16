import { TILE_SIZE } from "./tileSize";

interface ProjectedPosition {
  x: number;
  y: number;
}

/** Projects a floor-local pixel position into the viewer floor's 2D plane. */
export function projectFloorPosition(
  x: number,
  y: number,
  viewerFloor: number,
  objectFloor: number,
): ProjectedPosition {
  const shift = (viewerFloor - objectFloor) * TILE_SIZE;
  return { x: x - shift, y: y - shift };
}
