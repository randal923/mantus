import { describe, expect, it } from "vitest";
import { formatPreyDuration } from "./formatPreyDuration";

describe("formatPreyDuration", () => {
  it("formats sub-minute values as seconds", () => {
    expect(formatPreyDuration(0)).toBe("0s");
    expect(formatPreyDuration(45)).toBe("45s");
    expect(formatPreyDuration(59)).toBe("59s");
  });

  it("formats sub-hour values as whole minutes", () => {
    expect(formatPreyDuration(60)).toBe("1min");
    expect(formatPreyDuration(119)).toBe("1min");
    expect(formatPreyDuration(3_599)).toBe("59min");
  });

  it("formats hour-plus values as hours and minutes", () => {
    expect(formatPreyDuration(3_600)).toBe("1h 0min");
    expect(formatPreyDuration(7_199)).toBe("1h 59min");
    expect(formatPreyDuration(7_200)).toBe("2h 0min");
    expect(formatPreyDuration(72_000)).toBe("20h 0min");
  });

  it("clamps negative and fractional inputs", () => {
    expect(formatPreyDuration(-5)).toBe("0s");
    expect(formatPreyDuration(90.9)).toBe("1min");
  });
});
