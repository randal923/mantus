import { describe, expect, it } from "vitest";
import { getStepDurationMs } from "./getStepDurationMs";

describe("getStepDurationMs", () => {
  it("uses server speed and ground speed rounded to the tick", () => {
    expect(getStepDurationMs(110, 150, 25)).toBe(550);
    expect(getStepDurationMs(110, 100, 25)).toBe(375);
    expect(getStepDurationMs(210, 150, 25)).toBe(325);
  });

  it("applies the deliberate Tibia diagonal cost", () => {
    expect(getStepDurationMs(110, 150, 25, true)).toBe(1_650);
  });

  it("rejects invalid timing inputs", () => {
    expect(() => getStepDurationMs(0, 150, 25)).toThrow();
    expect(() => getStepDurationMs(110, 0, 25)).toThrow();
    expect(() => getStepDurationMs(110, 150, 0)).toThrow();
  });
});
