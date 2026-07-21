import type { Position, ViewRange } from "@tibia/protocol";

const GROUND_FLOOR = 7;

export function canSee(
  viewer: Position,
  target: Position,
  range: ViewRange,
  firstVisibleFloor = viewer.z,
): boolean {
  if (viewer.z > GROUND_FLOOR && target.z !== viewer.z) return false;
  // Surface viewers see down to the ground floor, like Tibia's floor stack.
  if (target.z < firstVisibleFloor || target.z > Math.max(viewer.z, GROUND_FLOOR)) {
    return false;
  }
  const shift = viewer.z - target.z;
  return (
    Math.abs(viewer.x - (target.x - shift)) <= range.x &&
    Math.abs(viewer.y - (target.y - shift)) <= range.y
  );
}
