import { describe, expect, it } from "vitest";
import { getExperienceRate } from "./getExperienceRate";

const BASE = {
  level: 30,
  baseRate: 1,
  useStages: true,
  staminaMultiplier: 1,
  xpBoostPercent: 50,
  xpBoostUntilMs: 0,
  nowMs: 1_000,
};

describe("getExperienceRate", () => {
  it("reads the base rate from the level's stage band", () => {
    // Canary's stages: levels 21-50 award x5.
    expect(getExperienceRate(BASE).basePercent).toBe(500);
    expect(getExperienceRate({ ...BASE, level: 5 }).basePercent).toBe(700);
    expect(getExperienceRate({ ...BASE, level: 150 }).basePercent).toBe(200);
  });

  it("uses the flat rate when stages are off", () => {
    expect(
      getExperienceRate({ ...BASE, useStages: false, baseRate: 3 }).basePercent,
    ).toBe(300);
  });

  it("counts an XP boost only while it is still running", () => {
    const running = getExperienceRate({ ...BASE, xpBoostUntilMs: 61_000 });
    const expired = getExperienceRate({ ...BASE, xpBoostUntilMs: 999 });

    expect(running.xpBoostPercent).toBe(50);
    expect(running.xpBoostRemainingMs).toBe(60_000);
    expect(expired.xpBoostPercent).toBe(0);
    expect(expired.xpBoostRemainingMs).toBe(0);
  });

  it("composes base, boost and stamina the way the kill path does", () => {
    // x5 base, +50% boost, 150% stamina → 500 * 1.5 * 1.5 = 1125%.
    expect(
      getExperienceRate({
        ...BASE,
        xpBoostUntilMs: 61_000,
        staminaMultiplier: 1.5,
      }).totalPercent,
    ).toBe(1_125);
  });

  it("reports a total of zero once stamina has run out", () => {
    const drained = getExperienceRate({ ...BASE, staminaMultiplier: 0 });

    expect(drained.staminaPercent).toBe(0);
    expect(drained.totalPercent).toBe(0);
  });
});
