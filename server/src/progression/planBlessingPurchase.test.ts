import { describe, expect, it } from "vitest";
import { blessingMaskOf } from "./blessings";
import { planBlessingPurchase } from "./planBlessingPurchase";

const REGULAR_IDS = [2, 3, 4, 5, 6];

describe("planBlessingPurchase", () => {
  it("prices the Inquisition full bless at Canary's advertised 110000", () => {
    // Level 120: single regular bless 20000, times five missing, times 1.1.
    const plan = planBlessingPurchase(REGULAR_IDS, 0, 120, 10);
    expect(plan.missingIds).toEqual(REGULAR_IDS);
    expect(plan.grantMask).toBe(blessingMaskOf(REGULAR_IDS));
    expect(plan.price).toBe(110_000);
  });

  it("skips blessings the character already holds and never charges for them", () => {
    const owned = blessingMaskOf([2]);
    const plan = planBlessingPurchase(REGULAR_IDS, owned, 120, 10);
    expect(plan.missingIds).toEqual([3, 4, 5, 6]);
    expect(plan.grantMask & owned).toBe(0);
    expect(plan.price).toBe(88_000);
  });

  it("returns an empty plan when everything offered is already held", () => {
    const plan = planBlessingPurchase(
      REGULAR_IDS,
      blessingMaskOf(REGULAR_IDS),
      120,
      10,
    );
    expect(plan.missingIds).toEqual([]);
    expect(plan.grantMask).toBe(0);
    expect(plan.price).toBe(0);
  });

  it("prices singles on the plain curve and enhanced ids on theirs", () => {
    expect(planBlessingPurchase([5], 0, 30, 0).price).toBe(2_000);
    expect(planBlessingPurchase([5], 0, 100, 0).price).toBe(16_000);
    expect(planBlessingPurchase([7], 0, 121, 0).price).toBe(26_100);
  });

  it("floors a fractional surcharged total", () => {
    // Level 121: single 20075, five missing → 100375, times 1.1 = 110412.5.
    expect(planBlessingPurchase(REGULAR_IDS, 0, 121, 10).price).toBe(110_412);
  });

  it("rejects unknown blessing ids and out-of-range surcharges", () => {
    expect(() => planBlessingPurchase([9], 0, 100, 0)).toThrow(/unknown/);
    expect(() => planBlessingPurchase([2], 0, 100, -1)).toThrow(/surcharge/);
    expect(() => planBlessingPurchase([2], 0, 100, 101)).toThrow(/surcharge/);
  });
});
