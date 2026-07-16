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

/** Bounded deterministic breadth-first pathfinding on one authoritative floor. */
export function findPath(options: {
  start: Position;
  isGoal(position: Position): boolean;
  canStep(position: Position): boolean;
  maxVisited: number;
}): { directions: Direction[]; visited: number } {
  if (options.maxVisited <= 0) return { directions: [], visited: 0 };
  if (options.isGoal(options.start)) return { directions: [], visited: 1 };
  const queue: Array<{ position: Position; path: Direction[] }> = [
    { position: options.start, path: [] },
  ];
  const seen = new Set([`${options.start.x},${options.start.y}`]);
  let cursor = 0;
  let visited = 0;
  while (cursor < queue.length && visited < options.maxVisited) {
    const current = queue[cursor++];
    if (!current) break;
    visited++;
    for (const step of STEPS) {
      const position = {
        x: current.position.x + step.dx,
        y: current.position.y + step.dy,
        z: options.start.z,
      };
      const key = `${position.x},${position.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!options.canStep(position)) continue;
      const path = [...current.path, step.direction];
      if (options.isGoal(position)) return { directions: path, visited };
      queue.push({ position, path });
    }
  }
  return { directions: [], visited };
}
