import type { Position } from "@tibia/protocol";

export function positionKey(position: Position): string {
  return `${position.z}:${position.x},${position.y}`;
}
