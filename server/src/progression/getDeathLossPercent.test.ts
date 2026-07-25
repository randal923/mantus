import { describe, expect, it } from "vitest";
import { getDeathLossPercent } from "./getDeathLossPercent";
import { getExperienceForLevel } from "./getExperienceForLevel";

function percentFor(
  overrides: Partial<Parameters<typeof getDeathLossPercent>[0]> = {},
): number {
  return getDeathLossPercent({
    level: 8,
    experience: getExperienceForLevel(8),
    levelPercent: 0,
    promoted: false,
    blessings: 0,
    unfairFightReduction: 100,
    ...overrides,
  });
}

describe("getDeathLossPercent", () => {
  it("charges a flat tenth below level 25", () => {
    expect(percentFor()).toBeCloseTo(0.1, 10);
    expect(percentFor({ level: 24, experience: getExperienceForLevel(24) })).
      toBeCloseTo(0.1, 10);
  });

  it("follows Canary's curve from level 25 up", () => {
    const level = 100;
    const experience = getExperienceForLevel(level);
    const expected =
      ((level + 50) * 50 * (level * level - 5 * level + 8)) /
      experience /
      100;

    expect(percentFor({ level, experience })).toBeCloseTo(expected, 12);
    // The relative cost of a death falls as the character grows.
    expect(percentFor({ level, experience })).toBeLessThan(percentFor());
  });

  it("discounts promotion by 30% and each blessing by 8%", () => {
    const base = percentFor();

    expect(percentFor({ promoted: true })).toBeCloseTo(base * 0.7, 12);
    expect(percentFor({ blessings: 1 })).toBeCloseTo(base * 0.92, 12);
    expect(percentFor({ blessings: 5 })).toBeCloseTo(base * 0.6, 12);
    // Reductions stack additively: 8 blessings plus a promotion leave 6%.
    expect(percentFor({ blessings: 8, promoted: true })).toBeCloseTo(
      base * 0.06,
      12,
    );
  });

  it("scales the whole penalty by the unfair-fight reduction", () => {
    const base = percentFor();

    expect(percentFor({ unfairFightReduction: 50 })).toBeCloseTo(base / 2, 12);
    expect(percentFor({ unfairFightReduction: 20 })).toBeCloseTo(base / 5, 12);
  });

  it("refuses out-of-range inputs instead of guessing", () => {
    expect(() => percentFor({ blessings: 9 })).toThrow();
    expect(() => percentFor({ blessings: -1 })).toThrow();
    expect(() => percentFor({ unfairFightReduction: 0 })).toThrow();
    expect(() => percentFor({ unfairFightReduction: 101 })).toThrow();
    expect(() => percentFor({ levelPercent: 101 })).toThrow();
    expect(() => percentFor({ level: 0 })).toThrow();
  });
});
