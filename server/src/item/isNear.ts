import type { Position } from "@tibia/protocol";

/** Same floor and within one tile (Chebyshev distance) of each other. */
export function isNear(left: Position, right: Position): boolean {
  return (
    left.z === right.z &&
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1
  );
}
