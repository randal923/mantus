import type { Position, ViewRange } from "@tibia/protocol";

export function canSee(
  viewer: Position,
  target: Position,
  range: ViewRange,
  firstVisibleFloor = viewer.z,
): boolean {
  if (viewer.z > 7 && target.z !== viewer.z) return false;
  if (target.z < firstVisibleFloor || target.z > viewer.z) return false;
  const shift = viewer.z - target.z;
  return (
    Math.abs(viewer.x - (target.x - shift)) <= range.x &&
    Math.abs(viewer.y - (target.y - shift)) <= range.y
  );
}
