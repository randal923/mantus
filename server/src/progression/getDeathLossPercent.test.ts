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
  it("charges a flat tenth below level 24", () => {
    expect(percentFor()).toBeCloseTo(0.1, 10);
    expect(percentFor({ level: 23, experience: getExperienceForLevel(23) })).
      toBeCloseTo(0.1, 10);
  });

  it("takes the curve from level 24, as Canary does", () => {
    // getLostPercent() branches on `level >= 24`; level 24 itself is on the
    // curve, not on the flat low-level percentage.
    const level = 24;
    const experience = getExperienceForLevel(level);
    const expected =
      ((level + 50) * 50 * (level * level - 5 * level + 8)) /
      Number(experience) /
      100;
    expect(percentFor({ level, experience })).toBeCloseTo(expected, 12);
    expect(percentFor({ level, experience })).not.toBeCloseTo(0.1, 4);
  });

  it("rounds a large low-level blessing discount up to 50%", () => {
    // Below the curve threshold Canary clamps a reduction that already reaches
    // 40% up to 50%, before promotion is added.
    const low = { level: 20, experience: getExperienceForLevel(20) };
    const base = percentFor(low);

    // Four blessings is 32% — under the trigger, so still linear.
    expect(percentFor({ ...low, blessings: 4 })).toBeCloseTo(base * 0.68, 12);
    // Five is 40% — clamped to 50%.
    expect(percentFor({ ...low, blessings: 5 })).toBeCloseTo(base * 0.5, 12);
    expect(percentFor({ ...low, blessings: 7 })).toBeCloseTo(base * 0.5, 12);
    // Promotion is added after the clamp, so it is never swallowed by it.
    expect(percentFor({ ...low, blessings: 5, promoted: true })).toBeCloseTo(
      base * 0.2,
      12,
    );
  });

  it("does not clamp the discount once on the curve", () => {
    const level = 100;
    const experience = getExperienceForLevel(level);
    const base = percentFor({ level, experience });
    expect(percentFor({ level, experience, blessings: 5 })).toBeCloseTo(
      base * 0.6,
      12,
    );
  });

  it("follows Canary's curve from level 24 up", () => {
    const level = 100;
    const experience = getExperienceForLevel(level);
    const expected =
      ((level + 50) * 50 * (level * level - 5 * level + 8)) /
      Number(experience) /
      100;

    expect(percentFor({ level, experience })).toBeCloseTo(expected, 12);
    // The relative cost of a death falls as the character grows.
    expect(percentFor({ level, experience })).toBeLessThan(percentFor());
  });

  it("discounts promotion by 30% and each blessing by 8%", () => {
    // On the curve, where the low-level clamp does not apply.
    const onCurve = { level: 100, experience: getExperienceForLevel(100) };
    const base = percentFor(onCurve);

    expect(percentFor({ ...onCurve, promoted: true })).toBeCloseTo(
      base * 0.7,
      12,
    );
    expect(percentFor({ ...onCurve, blessings: 1 })).toBeCloseTo(
      base * 0.92,
      12,
    );
    expect(percentFor({ ...onCurve, blessings: 5 })).toBeCloseTo(
      base * 0.6,
      12,
    );
    // Reductions stack additively: 8 blessings plus a promotion leave 6%.
    expect(
      percentFor({ ...onCurve, blessings: 8, promoted: true }),
    ).toBeCloseTo(base * 0.06, 12);
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
