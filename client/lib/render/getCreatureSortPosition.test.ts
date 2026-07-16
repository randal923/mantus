import { describe, expect, it } from "vitest";
import { getCreatureSortPosition } from "./getCreatureSortPosition";

describe("getCreatureSortPosition", () => {
  it("sorts cardinal walks by the tile containing the creature's feet", () => {
    expect(getCreatureSortPosition(10, 10)).toEqual({ x: 10, y: 10 });
    expect(getCreatureSortPosition(10.01, 10)).toEqual({ x: 11, y: 10 });
    expect(getCreatureSortPosition(10, 10.01)).toEqual({ x: 10, y: 11 });
    expect(getCreatureSortPosition(9.99, 10)).toEqual({ x: 10, y: 10 });
    expect(getCreatureSortPosition(10, 9.99)).toEqual({ x: 10, y: 10 });
    expect(getCreatureSortPosition(9, 10)).toEqual({ x: 9, y: 10 });
    expect(getCreatureSortPosition(10, 9)).toEqual({ x: 10, y: 9 });
  });
});
