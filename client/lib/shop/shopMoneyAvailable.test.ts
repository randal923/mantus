import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { shopMoneyAvailable } from "./shopMoneyAvailable";

const SILVER_TOKEN = 22_516;

describe("shopMoneyAvailable", () => {
  it("adds the bank balance to carried coins at a gold shop", () => {
    expect(
      shopMoneyAvailable({
        currencyItemTypeId: GOLD_COIN_TYPE_ID,
        currencyAmount: 0,
        bankBalance: 1_000,
        inventory: { gold: 25, platinum: 3, crystal: 1 },
      }),
      // 25 + 300 + 10000 carried, plus 1000 banked.
    ).toBe(11_325);
  });

  it("counts only carried units for a custom shop currency", () => {
    expect(
      shopMoneyAvailable({
        currencyItemTypeId: SILVER_TOKEN,
        currencyAmount: 12,
        bankBalance: 1_000_000,
        inventory: { gold: 500, platinum: 0, crystal: 0 },
      }),
    ).toBe(12);
  });
});
