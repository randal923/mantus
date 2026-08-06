/**
 * Breadth-first walk search with the same rules the hunting bot uses at
 * runtime (`server/src/huntingBot/findRoutePath.ts`): four-way steps, the
 * map's own step-activated transitions resolved per step, walkable ground
 * with a real ground speed, and a hard visit budget.
 *
 * Generated routes are only trustworthy if the generator is at least as
 * strict as the server, so a leg this search cannot solve inside the runtime
 * budget never ships as one waypoint hop.
 */

const STEPS = [
  { direction: "north", dx: 0, dy: -1 },
  { direction: "east", dx: 1, dy: 0 },
  { direction: "south", dx: 0, dy: 1 },
  { direction: "west", dx: -1, dy: 0 },
];

const key = (position) => (position.x * 65_536 + position.y) * 16 + position.z;

export function findWalkPath({ map, start, goal, bounds, maxVisited }) {
  if (key(start) === key(goal)) return { path: [start], visited: 1 };
  const goalKey = key(goal);
  const queue = [start];
  const seen = new Set([key(start)]);
  const parents = new Map();
  let cursor = 0;
  let visited = 0;
  while (cursor < queue.length && visited < maxVisited) {
    const current = queue[cursor++];
    const currentKey = key(current);
    visited += 1;
    for (const step of STEPS) {
      const adjacent = {
        x: current.x + step.dx,
        y: current.y + step.dy,
        z: current.z,
      };
      if (
        adjacent.x < bounds.minX ||
        adjacent.x > bounds.maxX ||
        adjacent.y < bounds.minY ||
        adjacent.y > bounds.maxY
      ) {
        continue;
      }
      const adjacentKey = key(adjacent);
      if (seen.has(adjacentKey)) continue;
      seen.add(adjacentKey);
      if (!map.isWalkable(adjacent)) continue;
      const resolved = map.getTransition(adjacent)?.destination ?? adjacent;
      const resolvedKey = key(resolved);
      if (resolvedKey !== adjacentKey) {
        if (seen.has(resolvedKey)) continue;
        seen.add(resolvedKey);
      }
      if (!map.isWalkable(resolved) || !map.getGroundSpeed(resolved)) continue;
      parents.set(resolvedKey, { from: current, to: resolved });
      if (resolvedKey === goalKey) {
        return { path: unwind(parents, resolved, start), visited };
      }
      queue.push(resolved);
    }
  }
  return { path: null, visited };
}

function unwind(parents, goal, start) {
  const path = [goal];
  for (let at = goal; key(at) !== key(start); ) {
    const parent = parents.get(key(at));
    if (!parent) break;
    path.push(parent.from);
    at = parent.from;
  }
  return path.reverse();
}
