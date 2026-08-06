import assert from "node:assert/strict";
import { test } from "node:test";
import { findWalkPath } from "./findWalkPath.mjs";

/** A tiny map: `walls` are the only tiles a walker cannot stand on. */
const mapOf = (walls, transitions = new Map()) => ({
  isWalkable: (position) => !walls.has(`${position.x},${position.y},${position.z}`),
  getGroundSpeed: () => 100,
  getTransition: (position) =>
    transitions.get(`${position.x},${position.y},${position.z}`),
});

const bounds = { minX: 0, maxX: 20, minY: 0, maxY: 20 };

test("walks a straight corridor", () => {
  const { path } = findWalkPath({
    map: mapOf(new Set()),
    start: { x: 1, y: 1, z: 8 },
    goal: { x: 4, y: 1, z: 8 },
    bounds,
    maxVisited: 500,
  });
  assert.equal(path.length, 4);
  assert.deepEqual(path.at(-1), { x: 4, y: 1, z: 8 });
});

test("refuses a goal walled off from the start", () => {
  const walls = new Set(
    Array.from({ length: 21 }, (_, y) => `3,${y},8`),
  );
  const { path } = findWalkPath({
    map: mapOf(walls),
    start: { x: 1, y: 1, z: 8 },
    goal: { x: 5, y: 1, z: 8 },
    bounds,
    maxVisited: 5_000,
  });
  assert.equal(path, null);
});

test("never leaves the bounding box it was given", () => {
  // The wall only spans the narrow box; a search allowed to swing wider
  // would find its way around the top of it.
  const walls = new Set(["3,0,8", "3,1,8", "3,2,8", "3,3,8"]);
  const narrow = { minX: 0, maxX: 20, minY: 0, maxY: 3 };
  const { path } = findWalkPath({
    map: mapOf(walls),
    start: { x: 1, y: 1, z: 8 },
    goal: { x: 5, y: 1, z: 8 },
    bounds: narrow,
    maxVisited: 5_000,
  });
  assert.equal(path, null);
});

test("follows a step transition onto the floor it lands on", () => {
  const transitions = new Map([
    ["2,1,8", { destination: { x: 2, y: 1, z: 9 } }],
  ]);
  const { path } = findWalkPath({
    map: mapOf(new Set(), transitions),
    start: { x: 1, y: 1, z: 8 },
    goal: { x: 2, y: 1, z: 9 },
    bounds,
    maxVisited: 500,
  });
  assert.deepEqual(path.at(-1), { x: 2, y: 1, z: 9 });
});

test("gives up once it has spent its visit budget", () => {
  const { path, visited } = findWalkPath({
    map: mapOf(new Set(["19,19,8"])),
    start: { x: 0, y: 0, z: 8 },
    goal: { x: 19, y: 19, z: 8 },
    bounds,
    maxVisited: 5,
  });
  assert.equal(path, null);
  assert.equal(visited, 5);
});
