import type { Direction, Position } from "@tibia/protocol";

/**
 * Canary's `getPrimaryDirection`: the dominant cardinal direction from one
 * position to another, never a diagonal. Used by aim-at-target so a direction
 * spell lines up with the attack target the same way Canary does.
 */
export function primaryDirectionToward(
  from: Position,
  to: Position,
): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}
