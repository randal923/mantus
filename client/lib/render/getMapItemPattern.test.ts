import { describe, expect, it } from "vitest";
import { getMapItemPattern } from "./getMapItemPattern";

function patternObject(
  overrides: {
    px?: number;
    py?: number;
    stackable?: boolean;
    fluidContainer?: boolean;
    splash?: boolean;
    hangable?: boolean;
  } = {},
) {
  const { px = 4, py = 1, ...flags } = overrides;
  return {
    px,
    py,
    flags: {
      stackable: false,
      fluidContainer: false,
      splash: false,
      hangable: false,
      ...flags,
    },
  };
}

describe("getMapItemPattern", () => {
  it("uses all three map coordinates for item variation", () => {
    expect(
      getMapItemPattern(patternObject(), 1295, 1294, 6, {
        south: false,
        east: false,
      }),
    ).toEqual({ x: 1295, y: 1294, z: 6 });
  });

  it("does not use map coordinates as a stack count", () => {
    expect(
      getMapItemPattern(patternObject({ stackable: true, py: 2 }), 1295, 1294, 6, {
        south: false,
        east: false,
      }),
    ).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("draws a stack on the ground with its pile art", () => {
    const coins = patternObject({ stackable: true, py: 2 });
    expect(
      getMapItemPattern(coins, 10, 20, 7, { south: false, east: false }, 100),
    ).toEqual({ x: 3, y: 1, z: 0 });
    expect(
      getMapItemPattern(coins, 10, 20, 7, { south: false, east: false }, 3),
    ).toEqual({ x: 2, y: 0, z: 0 });
  });

  it("ignores a count on a stackable with no pile art", () => {
    expect(
      getMapItemPattern(
        patternObject({ stackable: true, px: 1, py: 1 }),
        10,
        20,
        7,
        { south: false, east: false },
        100,
      ),
    ).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("uses the wall hook direction for hanging decorations", () => {
    expect(
      getMapItemPattern(patternObject({ hangable: true, px: 3 }), 10, 20, 7, {
        south: false,
        east: true,
      }),
    ).toEqual({ x: 2, y: 0, z: 0 });
  });
});
