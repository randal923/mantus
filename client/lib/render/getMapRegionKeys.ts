import type { Position, ViewRange } from "@tibia/protocol";
import { getVisibleFloors } from "./getVisibleFloors";

export function getMapRegionKeys(
  position: Position,
  viewRange: ViewRange,
  regionSize: number,
  tileMargin: number,
): string[] {
  const keys = new Set<string>();
  const windowX = viewRange.x + tileMargin;
  const windowY = viewRange.y + tileMargin;
  for (const floor of getVisibleFloors(position.z)) {
    const floorShift = position.z - floor;
    const centerX = position.x + floorShift;
    const centerY = position.y + floorShift;
    const firstRegionX = Math.floor((centerX - windowX) / regionSize);
    const lastRegionX = Math.floor((centerX + windowX) / regionSize);
    const firstRegionY = Math.floor((centerY - windowY) / regionSize);
    const lastRegionY = Math.floor((centerY + windowY) / regionSize);
    for (let regionY = firstRegionY; regionY <= lastRegionY; regionY++) {
      for (let regionX = firstRegionX; regionX <= lastRegionX; regionX++) {
        keys.add(`${floor}:${regionX},${regionY}`);
      }
    }
  }
  return [...keys];
}
