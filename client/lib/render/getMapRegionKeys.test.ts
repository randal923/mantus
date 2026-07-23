import { describe, expect, it } from "vitest";
import { getMapRegionKeys } from "./getMapRegionKeys";

describe("getMapRegionKeys", () => {
  it("includes every visible surface floor at a destination", () => {
    expect(
      getMapRegionKeys(
        { x: 32_387, y: 31_820, z: 6 },
        { x: 9, y: 7 },
        256,
        2,
      ),
    ).toEqual([
      "7:126,124",
      "6:126,124",
      "5:126,124",
      "4:126,124",
      "3:126,124",
      "2:126,124",
      "1:126,124",
      "0:126,124",
    ]);
  });

  it("includes adjacent regions when the viewport crosses a boundary", () => {
    expect(
      getMapRegionKeys(
        { x: 256, y: 256, z: 8 },
        { x: 9, y: 7 },
        256,
        2,
      ),
    ).toEqual([
      "10:0,0",
      "10:1,0",
      "10:0,1",
      "10:1,1",
      "9:0,0",
      "9:1,0",
      "9:0,1",
      "9:1,1",
      "8:0,0",
      "8:1,0",
      "8:0,1",
      "8:1,1",
    ]);
  });
});
