import { describe, expect, it } from "vitest";
import { isWithinReach, walkStepsToReach } from "./walkStepsToReach";

const at = (x: number, y: number, z = 7) => ({ x, y, z });

describe("walkStepsToReach", () => {
  it("returns no steps when already adjacent or on the same tile", () => {
    expect(walkStepsToReach(at(5, 5), at(5, 5))).toEqual([]);
    expect(walkStepsToReach(at(5, 5), at(6, 6))).toEqual([]);
    expect(walkStepsToReach(at(5, 5), at(4, 5))).toEqual([]);
  });

  it("stops one tile short so the actor ends adjacent to the target", () => {
    // 3 east: walk 2 east to end adjacent (one tile west of the target).
    expect(walkStepsToReach(at(5, 5), at(8, 5))).toEqual(["east", "east"]);
    // 2 east: a single step lands adjacent.
    expect(walkStepsToReach(at(5, 5), at(7, 5))).toEqual(["east"]);
  });

  it("ends adjacent for a diagonal target", () => {
    const steps = walkStepsToReach(at(5, 5), at(8, 8));
    expect(steps).toEqual(["southeast", "southeast"]);
    // (5,5) + 2×SE = (7,7), which is chebyshev-adjacent to (8,8).
    expect(isWithinReach(at(7, 7), at(8, 8))).toBe(true);
  });

  it("never walks across floors", () => {
    expect(walkStepsToReach(at(5, 5, 7), at(9, 5, 6))).toEqual([]);
    expect(isWithinReach(at(5, 5, 7), at(5, 5, 6))).toBe(false);
  });
});
