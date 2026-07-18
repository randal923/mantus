import type { Position } from "@tibia/protocol";

export function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}
