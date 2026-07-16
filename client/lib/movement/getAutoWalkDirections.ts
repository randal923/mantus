import {
  PROTOCOL_LIMITS,
  type Direction,
  type Position,
} from "@tibia/protocol";

export function getAutoWalkDirections(
  from: Position,
  to: Position,
): Direction[] {
  if (from.z !== to.z) return [];
  const directions: Direction[] = [];
  let x = from.x;
  let y = from.y;
  while (
    (x !== to.x || y !== to.y) &&
    directions.length < PROTOCOL_LIMITS.maxAutoWalkSteps
  ) {
    const horizontal = Math.sign(to.x - x);
    const vertical = Math.sign(to.y - y);
    const direction = directionFor(horizontal, vertical);
    if (!direction) break;
    directions.push(direction);
    x += horizontal;
    y += vertical;
  }
  return directions;
}

function directionFor(
  horizontal: number,
  vertical: number,
): Direction | null {
  if (horizontal === 1 && vertical === -1) return "northeast";
  if (horizontal === 1 && vertical === 1) return "southeast";
  if (horizontal === -1 && vertical === 1) return "southwest";
  if (horizontal === -1 && vertical === -1) return "northwest";
  if (vertical === -1) return "north";
  if (horizontal === 1) return "east";
  if (vertical === 1) return "south";
  if (horizontal === -1) return "west";
  return null;
}
