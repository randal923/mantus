import type { Position } from "@tibia/protocol";
import type { RouteMap } from "./RouteMap";

/**
 * Nudges a hunting-guide coordinate onto ground a player could actually stand
 * on. The guide routes are drawn on a wiki map and routinely land a tile or
 * two inside a wall, so the tracer has to find the real floor beside them.
 *
 * The search is a deterministic Chebyshev ring walk on the point's own floor,
 * first hit wins, exactly like `TileOccupancy.findUnoccupiedPosition`. The
 * radius stays small on purpose: a wide search happily snaps to the far side
 * of a wall, which produces a route that looks plausible and goes somewhere
 * else entirely. Returning null and letting the caller flag the leg is the
 * honest outcome.
 */
export function snapToWalkable(
  map: RouteMap,
  raw: Position,
  maxRadius: number,
): Position | null {
  if (standable(map, raw)) return { ...raw };
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = { x: raw.x + dx, y: raw.y + dy, z: raw.z };
        if (standable(map, candidate)) return candidate;
      }
    }
  }
  return null;
}

function standable(map: RouteMap, position: Position): boolean {
  return map.isWalkable(position) && Boolean(map.getGroundSpeed(position));
}
