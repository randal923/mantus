import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import { countCarriedCoins } from "./countCarriedCoins";
import { countItemsOfType } from "./countItemsOfType";
import { countMoneyWorth } from "./countMoneyWorth";
import { GOLD_COIN_TYPE_ID } from "./CurrencyBalance";
import type { ShopCatalog } from "./ShopCatalog";
import type { ShopCurrencyProjection } from "./ShopCurrencyProjection";

/** Resolves the shop's currency and the player's current holdings of it. */
export function projectShopCurrency(
  items: ItemIntentHandler,
  player: Player,
  catalog: ShopCatalog,
): ShopCurrencyProjection | null {
  const snapshot = items.inventorySnapshot(player.id);
  const currencyItemTypeId = catalog.currencyItemTypeId ?? GOLD_COIN_TYPE_ID;
  const type = items.itemType(currencyItemTypeId);
  if (
    !snapshot ||
    !type ||
    (catalog.currencyItemTypeId !== undefined && !type.stackable)
  ) {
    return null;
  }
  return {
    currencyItemTypeId,
    currencySpriteId: type.spriteId,
    currencyName: catalog.currencyName ?? "gold",
    currencyAmount: catalog.currencyItemTypeId !== undefined
      ? countItemsOfType(snapshot.items, currencyItemTypeId)
      : countMoneyWorth(countCarriedCoins(snapshot.items)),
  };
}
