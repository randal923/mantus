type IsLookPossible = (floor: number, x: number, y: number) => boolean;
type LimitsFloorView = (
  floor: number,
  x: number,
  y: number,
  freeView: boolean,
) => boolean;

/** Finds the highest blocking roof/wall around the camera, never rising above lowestFloor. */
export function getFirstVisibleFloor(
  playerX: number,
  playerY: number,
  playerFloor: number,
  isLookPossible: IsLookPossible,
  limitsFloorView: LimitsFloorView,
  lowestFloor = 0,
): number {
  let firstVisibleFloor = lowestFloor;
  const neighbors = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;

  for (const [offsetX, offsetY] of neighbors) {
    const physicalX = playerX + offsetX;
    const physicalY = playerY + offsetY;
    const lookPossible = isLookPossible(playerFloor, physicalX, physicalY);
    const isPlayerTile = offsetX === 0 && offsetY === 0;
    if (!isPlayerTile && !lookPossible) continue;

    for (
      let floor = playerFloor - 1;
      floor >= firstVisibleFloor;
      floor--
    ) {
      const shift = playerFloor - floor;
      const coveredX = physicalX + shift;
      const coveredY = physicalY + shift;
      if (
        !limitsFloorView(floor, physicalX, physicalY, !lookPossible) &&
        !limitsFloorView(floor, coveredX, coveredY, lookPossible)
      ) {
        continue;
      }
      firstVisibleFloor = floor + 1;
      break;
    }
  }

  return firstVisibleFloor;
}
