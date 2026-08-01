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

  it("keeps the next reward on its countdown after today's claim", () => {
    expect(getDailyRewardDayState(2, 2, false)).toBe("next");
    expect(getDailyRewardDayState(3, 2, false)).toBe("locked");
  });

  it("has nothing collected at the start of a cycle", () => {
    expect(getDailyRewardDayState(0, 0, true)).toBe("current");
    expect(getDailyRewardDayState(1, 0, true)).toBe("locked");
  });
});
