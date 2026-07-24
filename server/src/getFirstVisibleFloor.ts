import type { Position } from "@tibia/protocol";
import type { MapData } from "./MapData";

const GROUND_FLOOR = 7;
const UNDERGROUND_FLOOR_AWARENESS = 2;

export function getFirstVisibleFloor(
  position: Position,
  map: MapData,
): number {
  // Surface viewers can be roofed all the way down to floor 0; underground
  // viewers can see at most UNDERGROUND_FLOOR_AWARENESS floors up toward the
  // surface (matching the client's getVisibleFloors range), and the covering
  // walk below raises this bound wherever a roof/wall blocks the view. This is
  // the single send-side cover policy — never reveal a floor past its roof.
  const lowestFloor =
    position.z > GROUND_FLOOR
      ? Math.max(GROUND_FLOOR + 1, position.z - UNDERGROUND_FLOOR_AWARENESS)
      : 0;
  let firstVisibleFloor = lowestFloor;
  const neighbors = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  for (const [offsetX, offsetY] of neighbors) {
    const physicalX = position.x + offsetX;
    const physicalY = position.y + offsetY;
    const lookTile = map.getTile({ x: physicalX, y: physicalY, z: position.z });
    const lookPossible = Boolean(lookTile && !lookTile.blocksProjectile);
    if ((offsetX !== 0 || offsetY !== 0) && !lookPossible) continue;
    for (let floor = position.z - 1; floor >= firstVisibleFloor; floor--) {
      const shift = position.z - floor;
      const physical = map.getTile({ x: physicalX, y: physicalY, z: floor });
      const covered = map.getTile({
        x: physicalX + shift,
        y: physicalY + shift,
        z: floor,
      });
      const physicalLimits = lookPossible
        ? physical?.limitsFloorView
        : physical?.limitsFloorViewFree;
      const coveredLimits = lookPossible
        ? covered?.limitsFloorViewFree
        : covered?.limitsFloorView;
      if (!physicalLimits && !coveredLimits) continue;
      firstVisibleFloor = floor + 1;
      break;
    }
  }
  return firstVisibleFloor;
}
