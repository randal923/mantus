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
    const center = { x: 101, y: 99, z: 7 };

    expect(areaPositions(origin, center, {
      shape: "tiles",
      offsets: [{ x: 0, y: -1 }],
      diagonalOffsets: [{ x: -1, y: -1 }, { x: 0, y: 0 }],
      directional: true,
    })).toEqual([
      { x: 102, y: 98, z: 7 },
      center,
    ]);
  });

  /**
   * Canary anchors the matrix on the target position, and for a direction
   * cast that is already the tile ahead of the caster. The matrix centre (the
   * `3` cell) is itself an affected tile, so a wave starts one tile ahead and
   * never covers the caster's own square.
   */
  it("starts a directional wave one tile ahead of the caster", () => {
    const caster = { x: 100, y: 100, z: 7 };
    const aheadNorth = { x: 100, y: 99, z: 7 };
    // Scorch's shape, trimmed: the centre cell plus the row in front of it.
    const wave = {
      shape: "tiles" as const,
      offsets: [{ x: 0, y: 0 }, { x: 0, y: -1 }],
      directional: true,
    };

    const north = areaPositions(caster, aheadNorth, wave);
    expect(north).toEqual([aheadNorth, { x: 100, y: 98, z: 7 }]);
    expect(north).not.toContainEqual(caster);

    const aheadSouth = { x: 100, y: 101, z: 7 };
    const south = areaPositions(caster, aheadSouth, wave);
    expect(south).toEqual([aheadSouth, { x: 100, y: 102, z: 7 }]);
    expect(south).not.toContainEqual(caster);
  });
});
