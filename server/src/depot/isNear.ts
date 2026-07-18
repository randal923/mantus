import type { Position } from "@tibia/protocol";

export function isNear(left: Position, right: Position): boolean {
  return (
    left.z === right.z &&
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1
  );
}
