import { describe, expect, it } from "vitest";
import { formatRewardCountdown } from "./formatRewardCountdown";

describe("formatRewardCountdown", () => {
  it("formats hours, minutes, and seconds", () => {
    expect(formatRewardCountdown(80_468_000)).toBe("22h 21m 08s");
    expect(formatRewardCountdown(2_468_000)).toBe("41m 08s");
    expect(formatRewardCountdown(8_000)).toBe("8s");
  });

  it("never counts past the deadline", () => {
    expect(formatRewardCountdown(0)).toBe("0s");
    expect(formatRewardCountdown(-5_000)).toBe("0s");
  });
});
