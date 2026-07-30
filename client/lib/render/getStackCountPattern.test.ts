import { describe, expect, it } from "vitest";
import { getStackCountPattern } from "./getStackCountPattern";

describe("getStackCountPattern", () => {
  it("maps a stack size onto Tibia's pile art", () => {
    expect([0, 1, 2, 3, 4].map((count) => getStackCountPattern(count))).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(getStackCountPattern(5)).toEqual({ x: 0, y: 1 });
    expect(getStackCountPattern(9)).toEqual({ x: 0, y: 1 });
    expect(getStackCountPattern(10)).toEqual({ x: 1, y: 1 });
    expect(getStackCountPattern(24)).toEqual({ x: 1, y: 1 });
    expect(getStackCountPattern(25)).toEqual({ x: 2, y: 1 });
    expect(getStackCountPattern(49)).toEqual({ x: 2, y: 1 });
    expect(getStackCountPattern(50)).toEqual({ x: 3, y: 1 });
    expect(getStackCountPattern(100)).toEqual({ x: 3, y: 1 });
  });

  it("treats junk counts as a single item", () => {
    expect(getStackCountPattern(Number.NaN)).toEqual({ x: 0, y: 0 });
    expect(getStackCountPattern(-5)).toEqual({ x: 0, y: 0 });
  });
});
