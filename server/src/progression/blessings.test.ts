import { describe, expect, it } from "vitest";
import {
  BLESSINGS,
  blessingIdsOf,
  blessingMaskOf,
  costOfBlessing,
  equipmentLossChancePercent,
  getBlessingCost,
  getPvpBlessingCost,
  hasBlessing,
  lossReducingBlessingCount,
} from "./blessings";

describe("blessings (Feature 72)", () => {
  it("pins the eight blessings from the Canary baseline", () => {
    expect(BLESSINGS.map((blessing) => blessing.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(BLESSINGS[0]).toMatchObject({
      name: "Twist of Fate",
      kind: "pvp",
      reducesLoss: false,
    });
    expect(BLESSINGS.filter((b) => b.kind === "enhanced").map((b) => b.name)).
      toEqual(["Heart of the Mountain", "Blood of the Mountain"]);
  });

  it("round-trips the bitmask", () => {
    const mask = blessingMaskOf([1, 3, 8]);
    expect(blessingIdsOf(mask)).toEqual([1, 3, 8]);
    expect(hasBlessing(mask, 3)).toBe(true);
    expect(hasBlessing(mask, 2)).toBe(false);
    expect(blessingMaskOf([])).toBe(0);
    expect(() => blessingMaskOf([9])).toThrow();
    expect(() => blessingMaskOf([0])).toThrow();
  });

  it("excludes Twist of Fate from the death-loss count", () => {
    // Canary's getLostPercent iterates ids 2..8, so the count caps at 7 even
    // with all eight carried — Twist of Fate protects the others in PVP but
    // never discounts the penalty itself.
    expect(lossReducingBlessingCount(blessingMaskOf([1]))).toBe(0);
    expect(lossReducingBlessingCount(blessingMaskOf([1, 2]))).toBe(1);
    expect(
      lossReducingBlessingCount(blessingMaskOf([1, 2, 3, 4, 5, 6, 7, 8])),
    ).toBe(7);
  });

  it("matches Canary's regular blessing cost curve", () => {
    // level <= 30 is flat.
    expect(getBlessingCost(1, false)).toBe(2000);
    expect(getBlessingCost(30, false)).toBe(2000);
    // 31..119 scales at 200 per level above 20.
    expect(getBlessingCost(31, false)).toBe(2200);
    expect(getBlessingCost(100, false)).toBe(16_000);
    expect(getBlessingCost(119, false)).toBe(19_800);
    // 120+ has its own base and slope.
    expect(getBlessingCost(120, false)).toBe(20_000);
    expect(getBlessingCost(200, false)).toBe(26_000);
  });

  it("charges more for the enhanced blessings above level 30", () => {
    expect(getBlessingCost(30, true)).toBe(2000);
    expect(getBlessingCost(100, true)).toBe(20_800);
    expect(getBlessingCost(120, true)).toBe(26_000);
    expect(getBlessingCost(200, true)).toBe(34_000);
    for (const level of [31, 60, 119, 120, 300]) {
      expect(getBlessingCost(level, true)).toBeGreaterThan(
        getBlessingCost(level, false),
      );
    }
  });

  it("uses the PVP curve for Twist of Fate", () => {
    expect(getPvpBlessingCost(30)).toBe(2000);
    expect(getPvpBlessingCost(100)).toBe(16_000);
    // Flat above 270, unlike the regular curve which keeps climbing.
    expect(getPvpBlessingCost(270)).toBe(50_000);
    expect(getPvpBlessingCost(999)).toBe(50_000);

    expect(costOfBlessing(BLESSINGS[0]!, 300)).toBe(getPvpBlessingCost(300));
    expect(costOfBlessing(BLESSINGS[1]!, 300)).toBe(
      getBlessingCost(300, false),
    );
    expect(costOfBlessing(BLESSINGS[6]!, 300)).toBe(getBlessingCost(300, true));
  });

  it("refuses an out-of-range level instead of guessing", () => {
    expect(() => getBlessingCost(0, false)).toThrow();
    expect(() => getBlessingCost(1.5, false)).toThrow();
    expect(() => getPvpBlessingCost(-1)).toThrow();
  });

  it("matches Canary's equipment loss chances", () => {
    // Containers drop at the table value; everything else at a tenth of it.
    expect(equipmentLossChancePercent(0, true)).toBe(100);
    expect(equipmentLossChancePercent(0, false)).toBe(10);
    expect(equipmentLossChancePercent(1, false)).toBe(7);
    expect(equipmentLossChancePercent(2, false)).toBe(4.5);
    expect(equipmentLossChancePercent(3, false)).toBe(2.5);
    expect(equipmentLossChancePercent(4, false)).toBe(1);
    // Five or more blessings drop nothing at all.
    for (const count of [5, 6, 7, 8]) {
      expect(equipmentLossChancePercent(count, false)).toBe(0);
      expect(equipmentLossChancePercent(count, true)).toBe(0);
    }
    expect(() => equipmentLossChancePercent(9, false)).toThrow();
  });
});
