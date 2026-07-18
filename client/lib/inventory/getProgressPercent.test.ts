import { describe, expect, it } from "vitest";
import { getProgressPercent } from "./getProgressPercent";

describe("getProgressPercent", () => {
  it("starts at 0 with no tries", () => {
    expect(getProgressPercent(0, 50)).toBe(0);
  });

  it("floors partial progress so 100 means complete", () => {
    expect(getProgressPercent(49, 50)).toBe(98);
    expect(getProgressPercent(1, 3)).toBe(33);
  });

  it("caps at 100 even if tries overshoot the requirement", () => {
    expect(getProgressPercent(75, 50)).toBe(100);
  });

  it("treats a capped level (max 0) as full", () => {
    expect(getProgressPercent(0, 0)).toBe(100);
  });

  it("clamps negative values to 0", () => {
    expect(getProgressPercent(-5, 50)).toBe(0);
  });
});
