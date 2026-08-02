import type { Position } from "@tibia/protocol";

/**
 * Where a clicked tile belongs in the ring: right after the leg it lands
 * closest to, so clicking beside the drawn path bends that part of the route
 * instead of tacking a detour onto the end.
 *
 * Only legs whose ends are both on the clicked tile's floor are considered —
 * a leg drawn on another floor has no meaningful distance to a click here.
 * With no such leg the tile is appended.
 */
export function insertWaypointAt(
  waypoints: ReadonlyArray<Position>,
  tile: Position,
): Position[] {
  if (waypoints.length < 2) return [...waypoints, tile];
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < waypoints.length; index++) {
    const from = waypoints[index];
    const to = waypoints[(index + 1) % waypoints.length];
    if (!from || !to) continue;
    if (from.z !== tile.z || to.z !== tile.z) continue;
    const distance = distanceToSegment(tile, from, to);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    bestIndex = index;
  }
  if (bestIndex === null) return [...waypoints, tile];
  return waypoints.toSpliced(bestIndex + 1, 0, tile);
}

function distanceToSegment(
  point: Position,
  from: Position,
  to: Position,
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const ratio = Math.min(
    1,
    Math.max(
      0,
      ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (from.x + dx * ratio),
    point.y - (from.y + dy * ratio),
  );
}
