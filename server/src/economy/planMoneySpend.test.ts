import { describe, expect, it } from "vitest";
import { CRYSTAL_WORTH, PLATINUM_WORTH } from "./CurrencyBalance";
import { planMoneySpend, type MoneySpendPlan } from "./planMoneySpend";

const spentWorth = (plan: MoneySpendPlan) =>
  plan.goldSpent +
  plan.platinumSpent * PLATINUM_WORTH +
  plan.crystalSpent * CRYSTAL_WORTH;

const changeWorth = (plan: MoneySpendPlan) =>
  plan.goldChange + plan.platinumChange * PLATINUM_WORTH;

describe("planMoneySpend", () => {
  it("returns null when the coins cannot cover the cost", () => {
    expect(
      planMoneySpend({ gold: 99, platinum: 0, crystal: 0 }, 100),
    ).toBeNull();
    expect(planMoneySpend({ gold: 0, platinum: 0, crystal: 0 }, 1)).toBeNull();
  });

  it("spends gold exactly without change", () => {
    expect(planMoneySpend({ gold: 150, platinum: 3, crystal: 0 }, 120)).toEqual(
      {
        goldSpent: 120,
        platinumSpent: 0,
        crystalSpent: 0,
        goldChange: 0,
        platinumChange: 0,
      },
    );
  });

  it("spends smallest denominations first and trims overpayment", () => {
    expect(planMoneySpend({ gold: 50, platinum: 2, crystal: 1 }, 240)).toEqual({
      goldSpent: 40,
      platinumSpent: 2,
      crystalSpent: 0,
      goldChange: 0,
      platinumChange: 0,
    });
  });

  it("prefers an exact platinum payment over gold plus change", () => {
    expect(planMoneySpend({ gold: 50, platinum: 1, crystal: 0 }, 100)).toEqual({
      goldSpent: 0,
      platinumSpent: 1,
      crystalSpent: 0,
      goldChange: 0,
      platinumChange: 0,
    });
  });

  it("breaks a crystal coin into platinum and gold change", () => {
    expect(planMoneySpend({ gold: 0, platinum: 0, crystal: 1 }, 50)).toEqual({
      goldSpent: 0,
      platinumSpent: 0,
      crystalSpent: 1,
      goldChange: 50,
      platinumChange: 99,
    });
  });

  it("never spends and refunds the same denomination", () => {
    for (const cost of [1, 99, 100, 101, 9_999, 10_000, 10_001, 123_456]) {
      for (const available of [
        { gold: 250, platinum: 40, crystal: 12 },
        { gold: 0, platinum: 0, crystal: 20 },
        { gold: 3, platinum: 150, crystal: 0 },
      ]) {
        const plan = planMoneySpend(available, cost);
        if (!plan) continue;
        if (plan.goldChange > 0) expect(plan.goldSpent).toBe(0);
        if (plan.platinumChange > 0) expect(plan.platinumSpent).toBe(0);
      }
    }
  });

  it("conserves currency for every representable cost", () => {
    const available = { gold: 137, platinum: 63, crystal: 4 };
    for (let cost = 0; cost <= 60_000; cost += 7) {
      const plan = planMoneySpend(available, cost);
      if (!plan) continue;
      expect(plan.goldSpent).toBeLessThanOrEqual(available.gold);
      expect(plan.platinumSpent).toBeLessThanOrEqual(available.platinum);
      expect(plan.crystalSpent).toBeLessThanOrEqual(available.crystal);
      expect(spentWorth(plan) - changeWorth(plan)).toBe(cost);
    }
  });

  it("rejects invalid inputs", () => {
    expect(() =>
      planMoneySpend({ gold: -1, platinum: 0, crystal: 0 }, 1),
    ).toThrow();
    expect(() =>
      planMoneySpend({ gold: 0, platinum: 0, crystal: 0 }, -1),
    ).toThrow();
    expect(() =>
      planMoneySpend({ gold: 0.5, platinum: 0, crystal: 0 }, 1),
    ).toThrow();
  });
});
