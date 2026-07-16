import { describe, expect, it } from "vitest";
import { getMapPointerPosition } from "./getMapPointerPosition";

describe("getMapPointerPosition", () => {
  it("inverts renderer camera and zoom into a map tile", () => {
    expect(getMapPointerPosition(112, 80, 16, -16, 3, 32, 7)).toEqual({
      x: 1,
      y: 1,
      z: 7,
    });
  });
});
