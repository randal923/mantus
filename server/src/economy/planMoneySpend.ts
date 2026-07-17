import { countMoneyWorth } from "./countMoneyWorth";
import {
  CRYSTAL_WORTH,
  PLATINUM_WORTH,
  type CurrencyBalance,
} from "./CurrencyBalance";

export interface MoneySpendPlan {
  readonly goldSpent: number;
  readonly platinumSpent: number;
  readonly crystalSpent: number;
  readonly goldChange: number;
  readonly platinumChange: number;
}

/**
 * Plans paying `cost` from carried coins, smallest denomination first, with
 * change granted in the fewest coins. Invariant: spent worth minus change
 * worth equals `cost` exactly. Returns null when the coins cannot cover it.
 */
export function planMoneySpend(
  available: CurrencyBalance,
  cost: number,
): MoneySpendPlan | null {
  if (!Number.isSafeInteger(cost) || cost < 0) {
    throw new Error("invalid money cost");
  }
  if (countMoneyWorth(available) < cost) return null;

  let goldSpent = Math.min(available.gold, cost);
  let remainder = cost - goldSpent;
  let platinumSpent = Math.min(
    available.platinum,
    Math.ceil(remainder / PLATINUM_WORTH),
  );
  remainder -= platinumSpent * PLATINUM_WORTH;
  const crystalSpent =
    remainder > 0 ? Math.ceil(remainder / CRYSTAL_WORTH) : 0;
  if (crystalSpent > available.crystal) return null;

  let overpay =
    goldSpent +
    platinumSpent * PLATINUM_WORTH +
    crystalSpent * CRYSTAL_WORTH -
    cost;
  const goldRefund = Math.min(goldSpent, overpay);
  goldSpent -= goldRefund;
  overpay -= goldRefund;
  const platinumRefund = Math.min(
    platinumSpent,
    Math.floor(overpay / PLATINUM_WORTH),
  );
  platinumSpent -= platinumRefund;
  overpay -= platinumRefund * PLATINUM_WORTH;

  return {
    goldSpent,
    platinumSpent,
    crystalSpent,
    goldChange: overpay % PLATINUM_WORTH,
    platinumChange: Math.floor(overpay / PLATINUM_WORTH),
  };
}
