import { describe, expect, it } from "vitest";
import { areaPositions } from "./areaPositions";

describe("areaPositions", () => {
  it("uses Canary's ranked radius matrix instead of square distance", () => {
    const center = { x: 100, y: 100, z: 7 };

    expect(areaPositions(center, center, { shape: "circle", radius: 1 })).toEqual([
      center,
    ]);
    expect(areaPositions(center, center, { shape: "circle", radius: 2 })).toEqual([
      { x: 100, y: 99, z: 7 },
      { x: 99, y: 100, z: 7 },
      center,
      { x: 101, y: 100, z: 7 },
      { x: 100, y: 101, z: 7 },
    ]);
  });

  it("uses Canary's separate diagonal matrix when one is registered", () => {
    const origin = { x: 100, y: 100, z: 7 };

    expect(areaPositions(origin, { x: 101, y: 99, z: 7 }, {
      shape: "tiles",
      offsets: [{ x: 0, y: -1 }],
      diagonalOffsets: [{ x: -1, y: -1 }, { x: 0, y: 0 }],
      directional: true,
    })).toEqual([
      { x: 101, y: 99, z: 7 },
      origin,
    ]);
  });
});
