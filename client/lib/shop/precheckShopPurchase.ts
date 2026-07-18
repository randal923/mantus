import {
  countMoneyWorth,
  GOLD_COIN_TYPE_ID,
  planMoneySpend,
  type InventoryState,
  type ShopActionFailedReason,
} from "@tibia/protocol";
import type { ShopCoinWeights } from "./ShopCoinWeights";

export interface ShopPurchaseCheckInput {
  readonly unitWeight: number;
  readonly amount: number;
  readonly totalCost: number;
  readonly currencyItemTypeId: number;
  readonly currencyAmount: number;
  readonly currencyWeight: number;
  readonly coinWeights: ShopCoinWeights;
  readonly pendingPurchaseCost: number;
  readonly inventory: Pick<
    InventoryState,
    "gold" | "platinum" | "crystal" | "usedWeight" | "capacityMax"
  >;
}

/**
 * Client mirror of the server's purchase precheck: funds and the exact
 * weight after paying (coins leave, goods arrive). The server re-validates
 * inside the transaction; this only saves the round-trip on certain failures.
 */
export function precheckShopPurchase(
  input: ShopPurchaseCheckInput,
): ShopActionFailedReason | null {
  const { inventory } = input;
  const capacityBudget = inventory.capacityMax * 100;
  if (input.currencyItemTypeId !== GOLD_COIN_TYPE_ID) {
    if (input.currencyAmount - input.pendingPurchaseCost < input.totalCost) {
      return "insufficient-funds";
    }
    const weightAfter =
      inventory.usedWeight -
      input.currencyWeight * input.totalCost +
      input.unitWeight * input.amount;
    return weightAfter > capacityBudget ? "no-capacity" : null;
  }
  const carried = {
    gold: inventory.gold,
    platinum: inventory.platinum,
    crystal: inventory.crystal,
  };
  const worth = countMoneyWorth(carried);
  if (worth - input.pendingPurchaseCost < input.totalCost) {
    return "insufficient-funds";
  }
  const plan = planMoneySpend(carried, Math.min(worth, input.totalCost));
  if (!plan) return "insufficient-funds";
  const paymentWeight =
    (plan.goldSpent - plan.goldChange) * input.coinWeights.gold +
    (plan.platinumSpent - plan.platinumChange) * input.coinWeights.platinum +
    plan.crystalSpent * input.coinWeights.crystal;
  const weightAfter =
    inventory.usedWeight - paymentWeight + input.unitWeight * input.amount;
  return weightAfter > capacityBudget ? "no-capacity" : null;
}
