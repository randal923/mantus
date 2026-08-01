import type { Position } from "@tibia/protocol";

export function getNearestMinimapRouteSegment(
  segments: ReadonlyArray<readonly [Position, Position]>,
  position: Position,
): readonly [Position, Position] | null {
  let nearest: readonly [Position, Position] | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const [start, end] = segment;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((position.x - start.x) * dx + (position.y - start.y) * dy) /
                lengthSquared,
            ),
          );
    const projectedX = start.x + projection * dx;
    const projectedY = start.y + projection * dy;
    const distance =
      (position.x - projectedX) ** 2 + (position.y - projectedY) ** 2;
    if (distance >= nearestDistance) continue;
    nearest = segment;
    nearestDistance = distance;
  }

  return nearest;
}
