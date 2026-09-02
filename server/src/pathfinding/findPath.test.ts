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
    expect(result.complete).toBe(false);
  });

  const manhattanTo =
    (goal: { x: number; y: number }) => (position: { x: number; y: number }) =>
      Math.abs(position.x - goal.x) + Math.abs(position.y - goal.y);

  it("reaches a distant goal across open ground within a small guided budget", () => {
    const goal = { x: 40, y: 30 };
    const result = findPath({
      start: { x: 0, y: 0, z: 7 },
      isGoal: (position) => position.x === goal.x && position.y === goal.y,
      canStep: () => true,
      maxVisited: 100,
      heuristic: manhattanTo(goal),
    });

    expect(result.complete).toBe(true);
    expect(result.directions).toHaveLength(70);
    expect(result.visited).toBeLessThanOrEqual(100);
  });

  it("hands back a partial path toward the goal when the guided budget runs out", () => {
    const goal = { x: 100, y: 0 };
    const result = findPath({
      start: { x: 0, y: 0, z: 7 },
      isGoal: (position) => position.x === goal.x && position.y === goal.y,
      canStep: () => true,
      maxVisited: 5,
      heuristic: manhattanTo(goal),
    });

    expect(result.complete).toBe(false);
    expect(result.directions).toEqual(["east", "east", "east", "east", "east"]);
  });

  it("returns no path when nothing visited is closer than the start", () => {
    // Walled in on the goal side: every reachable tile is farther away.
    const goal = { x: 10, y: 0 };
    const result = findPath({
      start: { x: 0, y: 0, z: 7 },
      isGoal: (position) => position.x === goal.x && position.y === goal.y,
      canStep: (position) => position.x < 0,
      maxVisited: 50,
      heuristic: manhattanTo(goal),
    });

    expect(result.complete).toBe(false);
    expect(result.directions).toEqual([]);
  });

  it("still finds the shortest guided path around a blocker", () => {
    const goal = { x: 4, y: 0 };
    const result = findPath({
      start: { x: 0, y: 0, z: 7 },
      isGoal: (position) => position.x === goal.x && position.y === goal.y,
      canStep: (position) =>
        position.y >= -5 &&
        position.y <= 5 &&
        !(position.x === 2 && position.y >= -1 && position.y <= 1),
      maxVisited: 200,
      heuristic: manhattanTo(goal),
    });

    expect(result.complete).toBe(true);
    expect(result.directions).toHaveLength(8);
  });
});
