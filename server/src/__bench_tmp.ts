import { performance } from "node:perf_hooks";
import { loadMapData } from "./loadMapData";
import { findPath } from "./pathfinding/findPath";

const t0 = performance.now();
const map = loadMapData("/home/randal/code/tibia/server/data", "otservbr", "Thais");
console.log("load ms", (performance.now() - t0).toFixed(0));
console.log("spawn", map.spawn);

// 1. random tile query cost
const spawn = map.spawn;
let hits = 0;
const N = 2_000_000;
const t1 = performance.now();
for (let i = 0; i < N; i++) {
  const x = spawn.x + ((i * 7919) % 2000) - 1000;
  const y = spawn.y + ((i * 6271) % 2000) - 1000;
  if (map.isWalkable({ x, y, z: 7 })) hits++;
}
const t1e = performance.now() - t1;
console.log(`isWalkable x${N}: ${t1e.toFixed(1)} ms => ${((t1e * 1e6) / N).toFixed(0)} ns/call, hits=${hits}`);

// getTile alone
const t1b = performance.now();
let present = 0;
for (let i = 0; i < N; i++) {
  const x = spawn.x + ((i * 7919) % 2000) - 1000;
  const y = spawn.y + ((i * 6271) % 2000) - 1000;
  if (map.getTile({ x, y, z: 7 })) present++;
}
const t1be = performance.now() - t1b;
console.log(`getTile x${N}: ${t1be.toFixed(1)} ms => ${((t1be * 1e6) / N).toFixed(0)} ns/call, present=${present}`);

// 2. findPath with maxVisited 8000, unreachable goal (worst case: full budget burn)
function bench(label: string, maxVisited: number, reachable: boolean, iters: number) {
  // warm
  for (let i = 0; i < 5; i++) {
    findPath({
      start: spawn,
      isGoal: (p) => (reachable ? p.x === spawn.x + 30 && p.y === spawn.y : p.x === -99999),
      canStep: (p) =>
        Math.max(Math.abs(p.x - spawn.x), Math.abs(p.y - spawn.y)) <= 64 && map.isWalkable(p, true),
      maxVisited,
    });
  }
  const t = performance.now();
  let visitedTotal = 0;
  let len = 0;
  for (let i = 0; i < iters; i++) {
    const r = findPath({
      start: spawn,
      isGoal: (p) => (reachable ? p.x === spawn.x + 30 && p.y === spawn.y : p.x === -99999),
      canStep: (p) =>
        Math.max(Math.abs(p.x - spawn.x), Math.abs(p.y - spawn.y)) <= 64 && map.isWalkable(p, true),
      maxVisited,
    });
    visitedTotal += r.visited;
    len = r.directions.length;
  }
  const e = performance.now() - t;
  console.log(
    `${label}: ${iters} calls in ${e.toFixed(1)} ms => ${(e / iters).toFixed(3)} ms/call, avgVisited=${(visitedTotal / iters).toFixed(0)}, pathLen=${len}`,
  );
}

bench("findPath budget=8000 unreachable(no box limit hit)", 8000, false, 200);
bench("findPath budget=8000 reachable(+30x)", 8000, true, 200);
bench("findPath budget=96 unreachable", 96, false, 2000);
bench("findPath budget=2000 unreachable", 2000, false, 500);

// 3. how many walkable tiles are within 64 chebyshev of spawn (BFS box saturation)
let walkableInBox = 0;
for (let dx = -64; dx <= 64; dx++) {
  for (let dy = -64; dy <= 64; dy++) {
    if (map.isWalkable({ x: spawn.x + dx, y: spawn.y + dy, z: 7 }, true)) walkableInBox++;
  }
}
console.log("walkable(pathable) tiles in 129x129 box around spawn:", walkableInBox);

// 4. transition counts
let transitionCount = 0;
const seen = new Set<string>();
for (let dx = -200; dx <= 200; dx++) {
  for (let dy = -200; dy <= 200; dy++) {
    for (let z = 0; z <= 15; z++) {
      const t = map.getTransition({ x: spawn.x + dx, y: spawn.y + dy, z }, "north");
      if (t) {
        transitionCount++;
        seen.add(t.kind);
      }
    }
  }
}
console.log("transitions within 200 tiles of spawn (all floors):", transitionCount, [...seen]);

let actionCount = 0;
const akinds = new Set<string>();
for (let dx = -200; dx <= 200; dx++) {
  for (let dy = -200; dy <= 200; dy++) {
    for (let z = 0; z <= 15; z++) {
      for (const act of ["use", "use-with"] as const) {
        const a = map.getAction({ x: spawn.x + dx, y: spawn.y + dy, z }, act);
        if (a) {
          actionCount++;
          akinds.add(`${a.kind}/${a.activation}`);
        }
      }
    }
  }
}
console.log("actions within 200 tiles of spawn (all floors):", actionCount, [...akinds]);
