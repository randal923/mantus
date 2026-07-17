import {
  CRYSTAL_WORTH,
  PLATINUM_WORTH,
  type CurrencyBalance,
} from "./CurrencyBalance";

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
