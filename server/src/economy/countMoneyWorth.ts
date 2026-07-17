import {
  CRYSTAL_WORTH,
  PLATINUM_WORTH,
  type CurrencyBalance,
} from "./CurrencyBalance";

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
