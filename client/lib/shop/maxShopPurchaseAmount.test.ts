import { describe, expect, it } from "vitest";
import { maxShopPurchaseAmount } from "./maxShopPurchaseAmount";

const limit = (overrides: Partial<Parameters<typeof maxShopPurchaseAmount>[0]>) =>
  maxShopPurchaseAmount({
    unitPrice: 20,
    unitWeight: 100,
    availableMoney: 100_000,
    freeCapacity: 100_000,
    maximumAmount: 100,
    ...overrides,
  });

describe("maxShopPurchaseAmount", () => {
  it("caps at the offer's own maximum when money and capacity are ample", () => {
    expect(limit({})).toBe(100);
  });

  it("caps at what the money covers", () => {
    expect(limit({ availableMoney: 137 })).toBe(6);
  });

  it("caps at what the remaining capacity can hold", () => {
    expect(limit({ freeCapacity: 950 })).toBe(9);
  });

  it("takes the smallest of the three limits", () => {
    expect(limit({ availableMoney: 200, freeCapacity: 500 })).toBe(5);
  });

  it("returns zero rather than a negative when nothing is affordable", () => {
    expect(limit({ availableMoney: 0 })).toBe(0);
    expect(limit({ freeCapacity: 0 })).toBe(0);
  });

  it("ignores price and weight limits for a free or weightless offer", () => {
    expect(limit({ unitPrice: 0, availableMoney: 0 })).toBe(100);
    expect(limit({ unitWeight: 0, freeCapacity: 0 })).toBe(100);
  });

  it("drops to what is left after a purchase spends the money", () => {
    // Buying 100 at 20 each costs 2000; from 2500 only 25 remain affordable.
    expect(limit({ availableMoney: 2_500 })).toBe(100);
    expect(limit({ availableMoney: 500 })).toBe(25);
  });
});
