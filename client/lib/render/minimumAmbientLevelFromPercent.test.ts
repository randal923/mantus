import { describe, expect, it } from "vitest";
import { minimumAmbientLevelFromPercent } from "./minimumAmbientLevelFromPercent";

describe("minimumAmbientLevelFromPercent", () => {
  it("maps the slider range onto 0-255", () => {
    expect(minimumAmbientLevelFromPercent(0)).toBe(0);
    expect(minimumAmbientLevelFromPercent(100)).toBe(255);
  });

  it("maps the default 25% to the classic floor of 64", () => {
    expect(minimumAmbientLevelFromPercent(25)).toBe(64);
  });

  it("clamps out-of-range input", () => {
    expect(minimumAmbientLevelFromPercent(-10)).toBe(0);
    expect(minimumAmbientLevelFromPercent(250)).toBe(255);
  });
});
