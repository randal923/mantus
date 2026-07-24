import type { Item } from "../item/Item";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  type CurrencyBalance,
} from "./CurrencyBalance";

export function countCarriedCoins(items: ReadonlyArray<Item>): CurrencyBalance {
  let gold = 0;
  let platinum = 0;
  let crystal = 0;
  for (const item of items) {
    if (item.typeId === GOLD_COIN_TYPE_ID) gold += item.count;
    else if (item.typeId === PLATINUM_COIN_TYPE_ID) platinum += item.count;
    else if (item.typeId === CRYSTAL_COIN_TYPE_ID) crystal += item.count;
  }
  return { gold, platinum, crystal };
}
