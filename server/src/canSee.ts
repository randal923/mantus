import type { Position, ViewRange } from "@tibia/protocol";

const GROUND_FLOOR = 7;
const MAX_FLOOR = 15;
const UNDERGROUND_FLOOR_AWARENESS = 2;

export function canSee(
  viewer: Position,
  target: Position,
  range: ViewRange,
  firstVisibleFloor = viewer.z,
): boolean {
  // Surface viewers see down to the ground floor; underground viewers see the
  // aware range around their floor. `firstVisibleFloor` (the cover-aware top)
  // is applied identically here and in the floor-set the send paths scan, so
  // covered floors are never leaked (charter rule 6). The top bound is clamped
  // to the aware range so a stale/too-low firstVisibleFloor can never reveal a
  // floor an underground viewer could not physically see (defense in depth —
  // never trust the caller's value).
  const highestVisibleFloor =
    viewer.z > GROUND_FLOOR
      ? Math.max(GROUND_FLOOR + 1, viewer.z - UNDERGROUND_FLOOR_AWARENESS)
      : 0;
  const lastVisibleFloor =
    viewer.z > GROUND_FLOOR
      ? Math.min(MAX_FLOOR, viewer.z + UNDERGROUND_FLOOR_AWARENESS)
      : GROUND_FLOOR;
  const topFloor = Math.max(firstVisibleFloor, highestVisibleFloor);
  if (target.z < topFloor || target.z > lastVisibleFloor) {
    return false;
  }
  const shift = viewer.z - target.z;
  return (
    Math.abs(viewer.x - (target.x - shift)) <= range.x &&
    Math.abs(viewer.y - (target.y - shift)) <= range.y
  );
}
