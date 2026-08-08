import { describe, expect, it } from "vitest";
import { getExperienceRate } from "./getExperienceRate";
import type { StageRow } from "./stageRates";

/** Stand-in for the config.yml experience table. */
const STAGES: ReadonlyArray<StageRow> = [
  { minLevel: 1, maxLevel: 8, multiplier: 50 },
  { minLevel: 9, maxLevel: 50, multiplier: 80 },
  { minLevel: 51, maxLevel: 150, multiplier: 40 },
  { minLevel: 151, multiplier: 2 },
];

const BASE = {
  level: 30,
  baseRate: 1,
  stages: STAGES,
  staminaMultiplier: 1,
  xpBoostPercent: 50,
  xpBoostUntilMs: 0,
  premium: false,
  nowMs: 1_000,
};

describe("getExperienceRate", () => {
  it("reads the base rate from the level's stage band", () => {
    expect(getExperienceRate(BASE).basePercent).toBe(8_000);
    expect(getExperienceRate({ ...BASE, level: 5 }).basePercent).toBe(5_000);
    expect(getExperienceRate({ ...BASE, level: 150 }).basePercent).toBe(4_000);
    expect(getExperienceRate({ ...BASE, level: 2_000 }).basePercent).toBe(200);
  });

  it("uses the flat rate when stages are off", () => {
    expect(
      getExperienceRate({ ...BASE, stages: [], baseRate: 3 }).basePercent,
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
    // x80 base, +50% boost, 150% stamina → 8000 * 1.5 * 1.5 = 18000%.
    expect(
      getExperienceRate({
        ...BASE,
        xpBoostUntilMs: 61_000,
        staminaMultiplier: 1.5,
      }).totalPercent,
    ).toBe(18_000);
  });

  it("adds the premium bonus only while premium is running", () => {
    const free = getExperienceRate(BASE);
    const premium = getExperienceRate({ ...BASE, premium: true });

    expect(free.premiumPercent).toBe(0);
    expect(free.totalPercent).toBe(8_000);
    expect(premium.premiumPercent).toBe(10);
    // x80 base, +10% premium → 8000 * 1.1 = 8800%.
    expect(premium.totalPercent).toBe(8_800);
  });

  it("reports a total of zero once stamina has run out", () => {
    const drained = getExperienceRate({ ...BASE, staminaMultiplier: 0 });

    expect(drained.staminaPercent).toBe(0);
    expect(drained.totalPercent).toBe(0);
  });
});
