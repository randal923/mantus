import { describe, expect, it } from "vitest";

import { resizeMinimapLayout } from "./resizeMinimapLayout";

const layout = { x: 100, y: 80, width: 300, height: 240 };

describe("resizeMinimapLayout", () => {
  it("resizes from the bottom-right corner", () => {
    expect(resizeMinimapLayout(layout, "southeast", 40, 30)).toEqual({
      x: 100,
      y: 80,
      width: 340,
      height: 270,
    });
  });

  it("keeps the opposite corner fixed when resizing from the top-left", () => {
    expect(resizeMinimapLayout(layout, "northwest", -40, -30)).toEqual({
      x: 60,
      y: 50,
      width: 340,
      height: 270,
    });
  });

  it("only changes the dimension controlled by an edge", () => {
    expect(resizeMinimapLayout(layout, "west", 30, 50)).toEqual({
      x: 130,
      y: 80,
      width: 270,
      height: 240,
    });
  });

  it("honors the minimum canvas dimensions", () => {
    expect(resizeMinimapLayout(layout, "northwest", 500, 500)).toEqual({
      x: 180,
      y: 140,
      width: 220,
      height: 180,
    });
  });

  it("does not move a top or left edge past the viewport origin", () => {
    expect(resizeMinimapLayout(layout, "northwest", -500, -500)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 320,
    });
  });

  it("honors the maximum canvas dimensions", () => {
    expect(resizeMinimapLayout(layout, "southeast", 500, 500)).toEqual({
      x: 100,
      y: 80,
      width: 720,
      height: 560,
    });
  });
});
