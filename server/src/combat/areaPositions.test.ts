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
   * The pinned AREA_BEAM5 / AREADIAGONAL_BEAM5 pair. Canary rotates the
   * cardinal matrix (`copyArea` ROTATE90/180/270) but *swaps in* the extended
   * matrix for the four diagonals (`setupExtArea`: mirror for east, flip for
   * south, both for south-east) — the two are not rotations of each other.
   */
  it("rotates the cardinal matrix and swaps in the diagonal one", () => {
    const caster = { x: 100, y: 100, z: 7 };
    const beam = {
      shape: "tiles" as const,
      offsets: [
        { x: 0, y: -4 },
        { x: 0, y: -3 },
        { x: 0, y: -2 },
        { x: 0, y: -1 },
        { x: 0, y: 0 },
      ],
      diagonalOffsets: [
        { x: -4, y: -4 },
        { x: -3, y: -3 },
        { x: -2, y: -2 },
        { x: -1, y: -1 },
        { x: 0, y: 0 },
      ],
      directional: true,
    };

    // East: the north matrix rotated 90 degrees, anchored one tile ahead.
    expect(areaPositions(caster, { x: 101, y: 100, z: 7 }, beam)).toEqual([
      { x: 105, y: 100, z: 7 },
      { x: 104, y: 100, z: 7 },
      { x: 103, y: 100, z: 7 },
      { x: 102, y: 100, z: 7 },
      { x: 101, y: 100, z: 7 },
    ]);
    // South: rotated 180 degrees.
    expect(areaPositions(caster, { x: 100, y: 101, z: 7 }, beam)).toEqual([
      { x: 100, y: 105, z: 7 },
      { x: 100, y: 104, z: 7 },
      { x: 100, y: 103, z: 7 },
      { x: 100, y: 102, z: 7 },
      { x: 100, y: 101, z: 7 },
    ]);
    // North-west: the extended matrix as authored, not a rotation.
    expect(areaPositions(caster, { x: 99, y: 99, z: 7 }, beam)).toEqual([
      { x: 95, y: 95, z: 7 },
      { x: 96, y: 96, z: 7 },
      { x: 97, y: 97, z: 7 },
      { x: 98, y: 98, z: 7 },
      { x: 99, y: 99, z: 7 },
    ]);
    // South-east: the extended matrix mirrored on both axes.
    expect(areaPositions(caster, { x: 101, y: 101, z: 7 }, beam)).toEqual([
      { x: 105, y: 105, z: 7 },
      { x: 104, y: 104, z: 7 },
      { x: 103, y: 103, z: 7 },
      { x: 102, y: 102, z: 7 },
      { x: 101, y: 101, z: 7 },
    ]);
  });

  /**
   * AREA_RING1_BURST3 marks its centre with `2`, not `3`: the centre anchors
   * the matrix but is not itself hit. The ring spares the whole 3x3 core.
   */
  it("leaves a 2-centre matrix's own tile out of the affected set", () => {
    const caster = { x: 100, y: 100, z: 7 };
    const ring = {
      shape: "tiles" as const,
      offsets: [
        { x: -2, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: -2 },
        { x: 0, y: 2 },
      ],
      directional: false,
    };

    const positions = areaPositions(caster, caster, ring);
    expect(positions).not.toContainEqual(caster);
    expect(positions).toEqual([
      { x: 98, y: 100, z: 7 },
      { x: 102, y: 100, z: 7 },
      { x: 100, y: 98, z: 7 },
      { x: 100, y: 102, z: 7 },
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
