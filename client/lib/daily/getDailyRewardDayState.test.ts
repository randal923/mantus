import { describe, expect, it } from "vitest";
import { getDailyRewardDayState } from "./getDailyRewardDayState";

describe("getDailyRewardDayState", () => {
  it("splits the cycle into collected, today, and locked", () => {
    const states = Array.from({ length: 7 }, (_, index) =>
      getDailyRewardDayState(index, 2, true),
    );
    expect(states).toEqual([
      "collected",
      "collected",
      "current",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
  });

  it("folds today into the collected run once it is claimed", () => {
    expect(getDailyRewardDayState(2, 2, false)).toBe("collected");
    expect(getDailyRewardDayState(3, 2, false)).toBe("locked");
  });

  it("has nothing collected at the start of a cycle", () => {
    expect(getDailyRewardDayState(0, 0, true)).toBe("current");
    expect(getDailyRewardDayState(1, 0, true)).toBe("locked");
  });
});
