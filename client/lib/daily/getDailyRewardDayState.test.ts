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
      "next",
      "locked",
      "locked",
      "locked",
    ]);
  });

  it("moves the countdown onto the day after a claimable one", () => {
    expect(getDailyRewardDayState(2, 2, true)).toBe("current");
    expect(getDailyRewardDayState(3, 2, true)).toBe("next");
  });

  it("keeps the next reward on its countdown after today's claim", () => {
    expect(getDailyRewardDayState(2, 2, false)).toBe("next");
    expect(getDailyRewardDayState(3, 2, false)).toBe("locked");
  });

  it("has nothing collected at the start of a cycle", () => {
    expect(getDailyRewardDayState(0, 0, true)).toBe("current");
    expect(getDailyRewardDayState(1, 0, true)).toBe("next");
  });

  it("has no waiting day while the last of the cycle is claimable", () => {
    const states = Array.from({ length: 7 }, (_, index) =>
      getDailyRewardDayState(index, 6, true),
    );
    expect(states.filter((state) => state === "next")).toHaveLength(0);
    expect(states[6]).toBe("current");
  });
});
