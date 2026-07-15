import type { Position } from "@tibia/protocol";

export interface ViewRange {
  x: number;
  y: number;
}

export function canSee(
  a: Position,
  b: Position,
  range: ViewRange,
): boolean {
  return (
    a.z === b.z &&
    Math.abs(a.x - b.x) <= range.x &&
    Math.abs(a.y - b.y) <= range.y
  );
}
