import type { Direction, Position } from "@tibia/protocol";
import { PathFrontier } from "./PathFrontier";

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

// Collision-free for any map coordinate (y stays far below 2^20, and the
// keys remain exact integers well inside Number.MAX_SAFE_INTEGER).
const KEY_STRIDE = 0x100000;

/**
 * Bounded deterministic pathfinding on one authoritative floor.
 *
 * Without a heuristic the search is breadth-first and `directions` is empty
 * whenever the goal is not reached within `maxVisited`. With one it is A*
 * (the estimate must never exceed the real remaining step count), and when
 * the budget runs out first, `directions` leads to the visited tile the
 * heuristic rates closest to the goal — empty only when no visited tile
 * beats the start — so a walker can still make progress and search again
 * from there. `complete` says whether the goal itself was reached.
 */
export function findPath(options: {
  start: Position;
  isGoal(position: Position): boolean;
  canStep(position: Position): boolean;
  maxVisited: number;
  heuristic?(position: Position): number;
}): { directions: Direction[]; visited: number; complete: boolean } {
  if (options.maxVisited <= 0) {
    return { directions: [], visited: 0, complete: false };
  }
  if (options.isGoal(options.start)) {
    return { directions: [], visited: 1, complete: true };
  }
  const guided = options.heuristic !== undefined;
  const estimate = options.heuristic ?? (() => 0);
  const startKey = options.start.x * KEY_STRIDE + options.start.y;
  const frontier = new PathFrontier(guided);
  frontier.push({
    position: options.start,
    steps: 0,
    estimate: estimate(options.start),
  });
  const seen = new Set([startKey]);
  const arrivals = new Map<
    number,
    { parentKey: number; direction: Direction }
  >();
  const pathTo = (key: number): Direction[] => {
    const directions: Direction[] = [];
    for (let at = key; at !== startKey; ) {
      const arrival = arrivals.get(at);
      if (!arrival) break;
      directions.push(arrival.direction);
      at = arrival.parentKey;
    }
    return directions.reverse();
  };
  let best: { key: number; estimate: number; steps: number } | null = null;
  let visited = 0;
  while (frontier.size > 0 && visited < options.maxVisited) {
    const current = frontier.pop();
    if (!current) break;
    const currentKey = current.position.x * KEY_STRIDE + current.position.y;
    visited++;
    for (const step of STEPS) {
      const x = current.position.x + step.dx;
      const y = current.position.y + step.dy;
      const key = x * KEY_STRIDE + y;
      if (seen.has(key)) continue;
      seen.add(key);
      const position = { x, y, z: options.start.z };
      if (!options.canStep(position)) continue;
      arrivals.set(key, { parentKey: currentKey, direction: step.direction });
      if (options.isGoal(position)) {
        return { directions: pathTo(key), visited, complete: true };
      }
      const steps = current.steps + 1;
      const remaining = estimate(position);
      if (
        guided &&
        (best === null ||
          remaining < best.estimate ||
          (remaining === best.estimate && steps < best.steps))
      ) {
        best = { key, estimate: remaining, steps };
      }
      frontier.push({ position, steps, estimate: remaining });
    }
  }
  if (best === null || best.estimate >= estimate(options.start)) {
    return { directions: [], visited, complete: false };
  }
  return { directions: pathTo(best.key), visited, complete: false };
}
