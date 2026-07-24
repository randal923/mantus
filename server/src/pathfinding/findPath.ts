import type { Direction, Position } from "@tibia/protocol";

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

/** Bounded deterministic breadth-first pathfinding on one authoritative floor. */
export function findPath(options: {
  start: Position;
  isGoal(position: Position): boolean;
  canStep(position: Position): boolean;
  maxVisited: number;
}): { directions: Direction[]; visited: number } {
  if (options.maxVisited <= 0) return { directions: [], visited: 0 };
  if (options.isGoal(options.start)) return { directions: [], visited: 1 };
  const startKey = options.start.x * KEY_STRIDE + options.start.y;
  const queue: Position[] = [options.start];
  const seen = new Set([startKey]);
  const arrivals = new Map<
    number,
    { parentKey: number; direction: Direction }
  >();
  let cursor = 0;
  let visited = 0;
  while (cursor < queue.length && visited < options.maxVisited) {
    const current = queue[cursor++];
    if (!current) break;
    const currentKey = current.x * KEY_STRIDE + current.y;
    visited++;
    for (const step of STEPS) {
      const x = current.x + step.dx;
      const y = current.y + step.dy;
      const key = x * KEY_STRIDE + y;
      if (seen.has(key)) continue;
      seen.add(key);
      const position = { x, y, z: options.start.z };
      if (!options.canStep(position)) continue;
      arrivals.set(key, { parentKey: currentKey, direction: step.direction });
      if (options.isGoal(position)) {
        const directions: Direction[] = [];
        for (let at = key; at !== startKey; ) {
          const arrival = arrivals.get(at);
          if (!arrival) break;
          directions.push(arrival.direction);
          at = arrival.parentKey;
        }
        return { directions: directions.reverse(), visited };
      }
      queue.push(position);
    }
  }
  return { directions: [], visited };
}
