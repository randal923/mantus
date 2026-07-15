import { describe, expect, it } from "vitest";
import { getVisibleFloors } from "./getVisibleFloors";

describe("getVisibleFloors", () => {
  it("draws the complete surface stack in deepest-to-highest order", () => {
    expect(getVisibleFloors(7)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(getVisibleFloors(4)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("bounds underground awareness around the current floor", () => {
    expect(getVisibleFloors(8)).toEqual([10, 9, 8]);
    expect(getVisibleFloors(12)).toEqual([14, 13, 12, 11, 10]);
    expect(getVisibleFloors(15)).toEqual([15, 14, 13]);
  });

  it("rejects illegal floors", () => {
    expect(() => getVisibleFloors(-1)).toThrow();
    expect(() => getVisibleFloors(16)).toThrow();
  });
});
