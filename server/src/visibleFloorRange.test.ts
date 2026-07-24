import { describe, expect, it } from "vitest";
import { visibleFloorRange } from "./visibleFloorRange";

describe("visibleFloorRange", () => {
  it("spans the cover-aware top down to the ground floor on the surface", () => {
    expect(visibleFloorRange({ x: 0, y: 0, z: 7 }, 0)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(visibleFloorRange({ x: 0, y: 0, z: 5 }, 3)).toEqual([3, 4, 5, 6, 7]);
  });

  it("spans the aware range around an underground floor", () => {
    // z=12 uncovered (firstFloor z-2=10) -> 10..14.
    expect(visibleFloorRange({ x: 0, y: 0, z: 12 }, 10)).toEqual([
      10, 11, 12, 13, 14,
    ]);
    // z=8 (top underground floor): own floor down to z+2=10.
    expect(visibleFloorRange({ x: 0, y: 0, z: 8 }, 8)).toEqual([8, 9, 10]);
  });

  it("clamps the deepest floor to the map maximum", () => {
    expect(visibleFloorRange({ x: 0, y: 0, z: 15 }, 13)).toEqual([13, 14, 15]);
    expect(visibleFloorRange({ x: 0, y: 0, z: 14 }, 12)).toEqual([
      12, 13, 14, 15,
    ]);
  });

  it("returns an empty range when the top floor is below the last", () => {
    expect(visibleFloorRange({ x: 0, y: 0, z: 12 }, 15)).toEqual([]);
  });
});
