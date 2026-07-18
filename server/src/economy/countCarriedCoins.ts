import type { Item } from "../item/Item";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  type CurrencyBalance,
} from "./CurrencyBalance";

export function countCarriedCoins(items: ReadonlyArray<Item>): CurrencyBalance {
  const count = (typeId: number) =>
    items
      .filter((item) => item.typeId === typeId)
      .reduce((total, item) => total + item.count, 0);
  return {
    gold: count(GOLD_COIN_TYPE_ID),
    platinum: count(PLATINUM_COIN_TYPE_ID),
    crystal: count(CRYSTAL_COIN_TYPE_ID),
  };
}
