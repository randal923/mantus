import type { Direction, Position } from "@tibia/protocol";
import { getAutoWalkDirections } from "./getAutoWalkDirections";

/** Chebyshev-adjacent (or the same tile) on the same floor. */
export function isWithinReach(from: Position, target: Position): boolean {
  return (
    from.z === target.z &&
    Math.max(Math.abs(from.x - target.x), Math.abs(from.y - target.y)) <= 1
  );
}

/**
 * Straight-line walk steps that end adjacent to `target` so a use/pickup can
 * then reach it. Empty when already in reach, or on a different floor — the
 * client never auto-walks across floors (the server owns floor transitions),
 * and the server re-validates every step regardless (charter golden rule).
 */
export function walkStepsToReach(
  from: Position,
  target: Position,
): Direction[] {
  if (isWithinReach(from, target)) return [];
  // getAutoWalkDirections ends ON the target; dropping the last step ends on
  // the adjacent tile.
  return getAutoWalkDirections(from, target).slice(0, -1);
}
