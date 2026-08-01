import { describe, expect, it } from "vitest";
import { minimapPixelToTile } from "./minimapPixelToTile";
import { worldToMinimapPixel } from "./worldToMinimapPixel";

const VIEW = {
  center: { x: 32_069, y: 31_901 },
  width: 200,
  height: 200,
  pixelsPerTile: 4,
  floor: 7,
};

describe("minimapPixelToTile", () => {
  it("maps the canvas centre to the view centre", () => {
    expect(minimapPixelToTile({ x: 100, y: 100 }, VIEW)).toEqual({
      x: 32_069,
      y: 31_901,
      z: 7,
    });
  });

  it("matches the projection drawMinimap draws with", () => {
    // drawMinimap.test.ts pins a creature ten tiles east at pixel x=140.
    expect(minimapPixelToTile({ x: 140, y: 100 }, VIEW).x).toBe(32_079);
  });

  it("round-trips every tile through the forward transform", () => {
    for (const offset of [-13, -1, 0, 1, 7, 24]) {
      const tile = { x: VIEW.center.x + offset, y: VIEW.center.y - offset };
      const pixel = worldToMinimapPixel(tile, VIEW);
      expect(minimapPixelToTile(pixel, VIEW)).toEqual({ ...tile, z: 7 });
    }
  });

  it("keeps sub-tile precision when asked for it", () => {
    const fractional = minimapPixelToTile({ x: 102, y: 100 }, VIEW, true);
    expect(fractional.x).toBeCloseTo(32_069.5, 5);
  });
});
