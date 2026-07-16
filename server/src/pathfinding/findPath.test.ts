import { describe, expect, it } from "vitest";
import { findPath } from "./findPath";

describe("findPath", () => {
  it("routes deterministically around blockers on the starting floor", () => {
    const blocked = new Set(["1,0"]);
    const result = findPath({
      start: { x: 0, y: 0, z: 7 },
      isGoal: (position) => position.x === 2 && position.y === 0,
      canStep: (position) =>
        position.x >= 0 &&
        position.y >= 0 &&
        position.x <= 2 &&
        position.y <= 1 &&
        !blocked.has(`${position.x},${position.y}`),
      maxVisited: 16,
    });

    expect(result.directions).toEqual(["south", "east", "east", "north"]);
    expect(result.visited).toBeLessThanOrEqual(16);
  });

  it("stops searching at the explicit work bound", () => {
    const result = findPath({
      start: { x: 0, y: 0, z: 7 },
      isGoal: (position) => position.x === 100,
      canStep: () => true,
      maxVisited: 5,
    });

    expect(result.directions).toEqual([]);
    expect(result.visited).toBe(5);
  });
});
