import { describe, expect, it } from "vitest";
import { getViewportRange } from "./getViewportRange";

describe("getViewportRange", () => {
  it("derives a centered tile range from the rendered screen size", () => {
    expect(getViewportRange(1920, 1080, 96)).toEqual({ x: 11, y: 7 });
    expect(getViewportRange(1280, 720, 96)).toEqual({ x: 8, y: 5 });
  });

  it("caps oversized screens to the protocol visibility limit", () => {
    expect(getViewportRange(100_000, 100_000, 96)).toEqual({ x: 32, y: 24 });
  });

  it("uses the smallest safe range for invalid dimensions", () => {
    expect(getViewportRange(0, 720, 96)).toEqual({ x: 1, y: 1 });
    expect(getViewportRange(1280, Number.NaN, 96)).toEqual({ x: 1, y: 1 });
  });
});
