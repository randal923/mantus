import type { Position } from "@tibia/protocol";

export function isInRange(
  from: Position,
  to: Position,
  range: number,
): boolean {
  return (
    from.z === to.z &&
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= range
  );
}
