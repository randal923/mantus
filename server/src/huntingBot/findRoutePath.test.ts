import { describe, expect, it } from "vitest";
import { gridMapData } from "../gridMapData";
import { findRoutePath } from "./findRoutePath";

const OPEN = {
  minX: 0,
  maxX: 20,
  minY: 0,
  maxY: 20,
} as const;

describe("findRoutePath", () => {
  it("walks around a wall instead of through it", () => {
    const map = gridMapData({
      name: "test",
      width: 10,
      height: 10,
      // A wall across y=5 with a single gap at x=8.
      blocked: Array.from({ length: 8 }, (_, x) => [x, 5] as const),
    });
    const { steps } = findRoutePath({
      map,
      start: { x: 1, y: 4, z: 7 },
      goal: { x: 1, y: 6, z: 7 },
      bounds: OPEN,
      maxVisited: 2_000,
    });
    expect(steps.length).toBeGreaterThan(2);
    expect(steps.at(-1)?.to).toEqual({ x: 1, y: 6, z: 7 });
    for (const step of steps) {
      expect(map.isWalkable(step.to)).toBe(true);
    }
  });

  it("takes a step-activated floor change", () => {
    const map = gridMapData({
      name: "test",
      width: 10,
      height: 10,
      blocked: [],
      floors: [6, 7],
      transitions: [
        {
          kind: "floor-change",
          activation: "step",
          itemId: 1_949,
          source: { x: 3, y: 3, z: 7 },
          destination: { x: 3, y: 3, z: 6 },
        },
      ],
    });
    const { steps } = findRoutePath({
      map,
      start: { x: 1, y: 3, z: 7 },
      goal: { x: 3, y: 3, z: 6 },
      bounds: OPEN,
      maxVisited: 2_000,
    });
    expect(steps.map((step) => step.to)).toEqual([
      { x: 2, y: 3, z: 7 },
      { x: 3, y: 3, z: 6 },
    ]);
  });

  it("never expands outside the bounding box", () => {
    const map = gridMapData({ name: "test", width: 40, height: 40, blocked: [] });
    const { steps } = findRoutePath({
      map,
      start: { x: 1, y: 1, z: 7 },
      goal: { x: 30, y: 1, z: 7 },
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
      maxVisited: 5_000,
    });
    expect(steps).toEqual([]);
  });

  it("gives up once the visit budget is spent", () => {
    const map = gridMapData({ name: "test", width: 60, height: 60, blocked: [] });
    const { steps, visited } = findRoutePath({
      map,
      start: { x: 1, y: 1, z: 7 },
      goal: { x: 50, y: 50, z: 7 },
      bounds: { minX: 0, maxX: 60, minY: 0, maxY: 60 },
      maxVisited: 20,
    });
    expect(steps).toEqual([]);
    expect(visited).toBeLessThanOrEqual(20);
  });

  it("routes around a blocked predicate without changing the map", () => {
    const map = gridMapData({
      name: "test",
      width: 10,
      height: 10,
      blocked: Array.from({ length: 10 }, (_, y) =>
        y === 4 ? ([5, 99] as const) : ([5, y] as const),
      ),
    });
    // The wall at x=5 has its gap at y=4; a creature standing in the gap must
    // make the goal unreachable rather than be walked through.
    const blocked = findRoutePath({
      map,
      start: { x: 1, y: 4, z: 7 },
      goal: { x: 9, y: 4, z: 7 },
      bounds: OPEN,
      maxVisited: 2_000,
      blocked: (position) =>
        position.x === 5 && position.y === 4 && position.z === 7,
    });
    expect(blocked.steps).toEqual([]);
    const clear = findRoutePath({
      map,
      start: { x: 1, y: 4, z: 7 },
      goal: { x: 9, y: 4, z: 7 },
      bounds: OPEN,
      maxVisited: 2_000,
    });
    expect(clear.steps.length).toBe(8);
  });
});
