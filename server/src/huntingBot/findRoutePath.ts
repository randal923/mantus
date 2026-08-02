import type { Direction, Position } from "@tibia/protocol";
import type { RouteMap } from "./RouteMap";

const STEPS: ReadonlyArray<{
  direction: Direction;
  dx: number;
  dy: number;
}> = [
  { direction: "north", dx: 0, dy: -1 },
  { direction: "east", dx: 1, dy: 0 },
  { direction: "south", dx: 0, dy: 1 },
  { direction: "west", dx: -1, dy: 0 },
];

/**
 * Collision-free for any map coordinate on any floor. `findPath`'s 2D key
 * carries no z, so it cannot be reused here: every floor would collapse onto
 * one plane. Stays exact well inside Number.MAX_SAFE_INTEGER.
 */
const key = (position: Position): number =>
  (position.x * 65_536 + position.y) * 16 + position.z;

interface RouteStep {
  readonly direction: Direction;
  readonly to: Position;
}

/**
 * Bounded breadth-first search that follows the map's own step-activated
 * floor changes, so a route may walk up a ramp exactly the way a player does.
 *
 * The resolution mirrors `MovementRules.tryMoveInternal`: a step lands on the
 * adjacent tile, the map's transition for *that* tile decides where the
 * walker actually ends up, and every gate is then re-checked on the resolved
 * position. Ladders, holes and ropes are `use` actions rather than steps, so
 * they are dead ends here — deliberately, since a walker cannot cross them
 * without a separate intent.
 *
 * This only reads immutable map geometry. It never consults live occupancy:
 * a creature standing in a corridor must not carve a permanent detour into a
 * saved route, and every step is re-validated at execution time anyway.
 */
export function findRoutePath(options: {
  readonly map: RouteMap;
  readonly start: Position;
  readonly goal: Position;
  /** Tiles outside this inclusive box are never expanded. */
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  };
  /**
   * Live obstacles the walker must route around — creatures standing in the
   * way, house tiles it may not enter. Absent when tracing a saved route, so
   * transient state never bakes a detour into stored waypoints.
   */
  readonly blocked?: (position: Position) => boolean;
  readonly maxVisited: number;
}): { steps: RouteStep[]; visited: number } {
  const { map, start, goal } = options;
  const goalKey = key(goal);
  if (key(start) === goalKey) return { steps: [], visited: 1 };
  if (options.maxVisited <= 0) return { steps: [], visited: 0 };
  const queue: Position[] = [start];
  const seen = new Set([key(start)]);
  const arrivals = new Map<
    number,
    { parentKey: number; step: RouteStep }
  >();
  let cursor = 0;
  let visited = 0;
  while (cursor < queue.length && visited < options.maxVisited) {
    const current = queue[cursor++];
    if (!current) break;
    const currentKey = key(current);
    visited++;
    for (const step of STEPS) {
      const adjacent = {
        x: current.x + step.dx,
        y: current.y + step.dy,
        z: current.z,
      };
      if (
        adjacent.x < options.bounds.minX ||
        adjacent.x > options.bounds.maxX ||
        adjacent.y < options.bounds.minY ||
        adjacent.y > options.bounds.maxY
      ) {
        continue;
      }
      const adjacentKey = key(adjacent);
      if (seen.has(adjacentKey)) continue;
      seen.add(adjacentKey);
      if (!map.isWalkable(adjacent)) continue;
      // Two different tiles can carry transitions onto the same destination,
      // so the resolved tile needs its own seen-check.
      const resolved =
        map.getTransition(adjacent, step.direction)?.destination ?? adjacent;
      const resolvedKey = key(resolved);
      if (resolvedKey !== adjacentKey) {
        if (seen.has(resolvedKey)) continue;
        seen.add(resolvedKey);
      }
      if (!map.isWalkable(resolved) || !map.getGroundSpeed(resolved)) continue;
      if (options.blocked?.(resolved)) continue;
      arrivals.set(resolvedKey, {
        parentKey: currentKey,
        step: { direction: step.direction, to: resolved },
      });
      if (resolvedKey === goalKey) {
        return { steps: unwind(arrivals, resolvedKey, key(start)), visited };
      }
      queue.push(resolved);
    }
  }
  return { steps: [], visited };
}

function unwind(
  arrivals: Map<number, { parentKey: number; step: RouteStep }>,
  from: number,
  startKey: number,
): RouteStep[] {
  const steps: RouteStep[] = [];
  for (let at = from; at !== startKey; ) {
    const arrival = arrivals.get(at);
    if (!arrival) break;
    steps.push(arrival.step);
    at = arrival.parentKey;
  }
  return steps.reverse();
}
