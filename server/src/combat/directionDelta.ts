import type { Direction } from "@tibia/protocol";

export function directionDelta(
  direction: Direction,
): readonly [number, number] {
  if (direction === "north") return [0, -1];
  if (direction === "east") return [1, 0];
  if (direction === "south") return [0, 1];
  if (direction === "west") return [-1, 0];
  if (direction === "northeast") return [1, -1];
  if (direction === "southeast") return [1, 1];
  if (direction === "southwest") return [-1, 1];
  return [-1, -1];
}
