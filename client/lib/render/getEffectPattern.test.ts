import { describe, expect, it } from "vitest";
import { getEffectPattern } from "./getEffectPattern";

const center = { x: 100, y: 100, z: 7 };

describe("getEffectPattern", () => {
  it("keeps single-pattern effects on their only cell", () => {
    expect(getEffectPattern({ x: 103, y: 97, z: 7 }, center, 1, 1)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("alternates a two-column effect by its offset to the screen centre", () => {
    expect(getEffectPattern({ x: 100, y: 100, z: 7 }, center, 2, 2).x).toBe(1);
    expect(getEffectPattern({ x: 101, y: 100, z: 7 }, center, 2, 2).x).toBe(0);
    expect(getEffectPattern({ x: 99, y: 100, z: 7 }, center, 2, 2).x).toBe(0);
    expect(getEffectPattern({ x: 100, y: 101, z: 7 }, center, 2, 2).y).toBe(1);
    expect(getEffectPattern({ x: 100, y: 99, z: 7 }, center, 2, 2).y).toBe(1);
    expect(getEffectPattern({ x: 100, y: 102, z: 7 }, center, 2, 2).y).toBe(0);
  });

  it("falls back to the first cell with no camera yet", () => {
    expect(getEffectPattern({ x: 100, y: 100, z: 7 }, null, 2, 2)).toEqual({
      x: 1,
      y: 0,
    });
  });
});
