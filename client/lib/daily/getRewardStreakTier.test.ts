import { describe, expect, it } from "vitest";
import { getRewardStreakTier } from "./getRewardStreakTier";

describe("getRewardStreakTier", () => {
  it("changes banner at 25, 50, and 100 consecutive days", () => {
    expect(getRewardStreakTier(0)).toBe("default");
    expect(getRewardStreakTier(24)).toBe("default");
    expect(getRewardStreakTier(25)).toBe("bronze");
    expect(getRewardStreakTier(49)).toBe("bronze");
    expect(getRewardStreakTier(50)).toBe("silver");
    expect(getRewardStreakTier(99)).toBe("silver");
    expect(getRewardStreakTier(100)).toBe("gold");
    expect(getRewardStreakTier(4_000)).toBe("gold");
  });
});
