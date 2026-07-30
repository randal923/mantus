import { describe, expect, it } from "vitest";
import { formatRewardCountdown } from "./formatRewardCountdown";

describe("formatRewardCountdown", () => {
  it("formats hours and minutes, dropping the hour when there is none", () => {
    expect(formatRewardCountdown(80_460_000)).toBe("22h 21m");
    expect(formatRewardCountdown(2_460_000)).toBe("41m");
  });

  it("never counts past the deadline", () => {
    expect(formatRewardCountdown(0)).toBe("0m");
    expect(formatRewardCountdown(-5_000)).toBe("0m");
  });
});
