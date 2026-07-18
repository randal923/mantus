import type { Direction, Position } from "@tibia/protocol";

export function directionToward(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx > 0 && dy < 0) return "northeast";
  if (dx > 0 && dy > 0) return "southeast";
  if (dx < 0 && dy > 0) return "southwest";
  if (dx < 0 && dy < 0) return "northwest";
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}
