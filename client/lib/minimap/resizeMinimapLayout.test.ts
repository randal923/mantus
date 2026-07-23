import { describe, expect, it } from "vitest";

import { resizeMinimapLayout } from "./resizeMinimapLayout";

const layout = { x: 100, y: 80, width: 300, height: 240 };

describe("resizeMinimapLayout", () => {
  it("resizes from the top-left while preserving the fixed anchor", () => {
    expect(resizeMinimapLayout(layout, "northwest", -40, -30)).toEqual({
      x: 100,
      y: 80,
      width: 340,
      height: 270,
    });
  });

  it("only changes the dimension controlled by an edge", () => {
    expect(resizeMinimapLayout(layout, "west", 30, 50)).toEqual({
      x: 100,
      y: 80,
      width: 270,
      height: 240,
    });
  });

  it("honors the minimum canvas dimensions", () => {
    expect(resizeMinimapLayout(layout, "northwest", 500, 500)).toEqual({
      x: 100,
      y: 80,
      width: 220,
      height: 180,
    });
  });

  it("honors the maximum canvas dimensions", () => {
    expect(resizeMinimapLayout(layout, "northwest", -500, -500)).toEqual({
      x: 100,
      y: 80,
      width: 720,
      height: 560,
    });
  });
});
