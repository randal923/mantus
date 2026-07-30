import type { Position } from "@tibia/protocol";

/**
 * Canary's look distance: the Chebyshev distance, plus 15 across floors so
 * anything on another floor is always "far away" for the weight, flavour-text,
 * and readable cut-offs.
 */
export function lookDistance(from: Position, to: Position): number {
  const distance = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  return from.z === to.z ? distance : distance + 15;
}
