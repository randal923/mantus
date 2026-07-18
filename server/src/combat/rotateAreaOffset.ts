import type { Direction } from "@tibia/protocol";

export function rotateAreaOffset(
  x: number,
  y: number,
  direction: Direction,
): readonly [number, number] {
  if (direction === "east") return [-y, x];
  if (direction === "south") return [-x, -y];
  if (direction === "west") return [y, -x];
  if (direction === "northeast" || direction === "southeast") {
    return [-y, x];
  }
  if (direction === "southwest" || direction === "northwest") {
    return [y, -x];
  }
  return [x, y];
}
