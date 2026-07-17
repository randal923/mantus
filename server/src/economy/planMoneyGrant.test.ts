import { describe, expect, it } from "vitest";
import { CRYSTAL_WORTH, PLATINUM_WORTH } from "./CurrencyBalance";
import { planMoneyGrant } from "./planMoneyGrant";

describe("planMoneyGrant", () => {
  it("decomposes an amount into the fewest coins", () => {
    expect(planMoneyGrant(0)).toEqual({ crystal: 0, platinum: 0, gold: 0 });
    expect(planMoneyGrant(99)).toEqual({ crystal: 0, platinum: 0, gold: 99 });
    expect(planMoneyGrant(100)).toEqual({ crystal: 0, platinum: 1, gold: 0 });
    expect(planMoneyGrant(12_345)).toEqual({
      crystal: 1,
      platinum: 23,
      gold: 45,
    });
  });

  it("conserves the amount", () => {
    for (const amount of [1, 99, 100, 9_999, 10_000, 123_456_789]) {
      const grant = planMoneyGrant(amount);
      expect(
        grant.gold +
          grant.platinum * PLATINUM_WORTH +
          grant.crystal * CRYSTAL_WORTH,
      ).toBe(amount);
      expect(grant.gold).toBeLessThan(PLATINUM_WORTH);
      expect(grant.platinum).toBeLessThan(CRYSTAL_WORTH / PLATINUM_WORTH);
    }
  });

  it("rejects invalid amounts", () => {
    expect(() => planMoneyGrant(-1)).toThrow();
    expect(() => planMoneyGrant(0.5)).toThrow();
  });
});
