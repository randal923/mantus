import { describe, expect, it } from "vitest";
import { getMapItemPattern } from "./getMapItemPattern";

describe("getMapItemPattern", () => {
  it("uses all three map coordinates for item variation", () => {
    const object = {
      px: 4,
      flags: {
        stackable: false,
        fluidContainer: false,
        splash: false,
        hangable: false,
      },
    };
    expect(getMapItemPattern(object, 1295, 1294, 6, { south: false, east: false })).toEqual({
      x: 1295,
      y: 1294,
      z: 6,
    });
  });

  it("does not use map coordinates as a stack count", () => {
    const stackable = {
      px: 4,
      flags: {
        stackable: true,
        fluidContainer: false,
        splash: false,
        hangable: false,
      },
    };

    expect(
      getMapItemPattern(stackable, 1295, 1294, 6, {
        south: false,
        east: false,
      }),
    ).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("uses the wall hook direction for hanging decorations", () => {
    const hangable = {
      px: 3,
      flags: {
        stackable: false,
        fluidContainer: false,
        splash: false,
        hangable: true,
      },
    };

    expect(
      getMapItemPattern(hangable, 10, 20, 7, { south: false, east: true }),
    ).toEqual({ x: 2, y: 0, z: 0 });
  });
});
