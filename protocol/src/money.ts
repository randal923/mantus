/**
 * Carried coin counts per denomination. Gold (type 3031) is worth 1,
 * platinum (3035) is worth 100, crystal (3043) is worth 10,000 — the
 * single canonical conversion path for all economy code. Shared so the
 * client can mirror the server's coin planning for pre-checks; the server
 * remains the authority on every transaction.
 */
export interface CurrencyBalance {
  readonly gold: number;
  readonly platinum: number;
  readonly crystal: number;
}

export const GOLD_COIN_TYPE_ID = 3031;
export const PLATINUM_COIN_TYPE_ID = 3035;
export const CRYSTAL_COIN_TYPE_ID = 3043;

export const PLATINUM_WORTH = 100;
export const CRYSTAL_WORTH = 10_000;

export interface MoneySpendPlan {
  readonly goldSpent: number;
  readonly platinumSpent: number;
  readonly crystalSpent: number;
  readonly goldChange: number;
  readonly platinumChange: number;
}

export function countMoneyWorth(balance: CurrencyBalance): number {
  if (
    !Number.isSafeInteger(balance.gold) ||
    balance.gold < 0 ||
    !Number.isSafeInteger(balance.platinum) ||
    balance.platinum < 0 ||
    !Number.isSafeInteger(balance.crystal) ||
    balance.crystal < 0
  ) {
    throw new Error("invalid currency balance");
  }
  const total =
    balance.gold +
    balance.platinum * PLATINUM_WORTH +
    balance.crystal * CRYSTAL_WORTH;
  if (!Number.isSafeInteger(total)) {
    throw new Error("currency balance is too large");
  }
  return total;
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

/** Decomposes an amount into the fewest coins (crystal, platinum, gold). */
export function planMoneyGrant(amount: number): CurrencyBalance {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("invalid money grant amount");
  }
  const crystal = Math.floor(amount / CRYSTAL_WORTH);
  const remainder = amount % CRYSTAL_WORTH;
  return {
    crystal,
    platinum: Math.floor(remainder / PLATINUM_WORTH),
    gold: remainder % PLATINUM_WORTH,
  };
}
