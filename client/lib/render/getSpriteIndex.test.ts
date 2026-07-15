import { describe, expect, it } from "vitest";
import { getSpriteIndex } from "./getSpriteIndex";

describe("getSpriteIndex", () => {
  it("selects adjacent wall patterns from map coordinates", () => {
    const verticalWall = {
      width: 2,
      height: 2,
      layers: 1,
      px: 1,
      py: 2,
      pz: 1,
    };

    expect(getSpriteIndex(verticalWall, { y: 0 })).toBe(0);
    expect(getSpriteIndex(verticalWall, { y: 1 })).toBe(4);
  });

  it("selects every visual layer", () => {
    const layeredItem = {
      width: 2,
      height: 2,
      layers: 2,
      px: 1,
      py: 1,
      pz: 1,
    };

    expect(getSpriteIndex(layeredItem, { l: 0 })).toBe(0);
    expect(getSpriteIndex(layeredItem, { l: 1 })).toBe(4);
  });
});
