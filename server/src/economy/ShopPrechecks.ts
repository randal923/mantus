import type { ShopActionFailedReason } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import { countCarriedCoins } from "./countCarriedCoins";
import { countItemsOfType } from "./countItemsOfType";
import { countMoneyWorth } from "./countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { itemHasShopSubtype } from "./itemHasShopSubtype";
import { planMoneyGrant } from "./planMoneyGrant";
import { planMoneySpend } from "./planMoneySpend";
import type { ShopItemSubtype } from "./ShopStore";

/** Fast in-memory checks at execution time; the store re-validates in SQL. */
export class ShopPrechecks {
  constructor(private readonly items: ItemIntentHandler) {}

  precheckPurchase(
    player: Player,
    unitWeight: number,
    amount: number,
    totalCost: number,
    currencyItemTypeId?: number,
  ): ShopActionFailedReason | null {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return "failed";
    if (currencyItemTypeId !== undefined) {
      if (countItemsOfType(snapshot.items, currencyItemTypeId) < totalCost) {
        return "insufficient-funds";
      }
      const weightAfter =
        this.usedWeight(snapshot.items) -
        this.itemWeight(currencyItemTypeId) * totalCost +
        unitWeight * amount;
      return weightAfter > snapshot.capacityMax * 100 ? "no-capacity" : null;
    }
    const carried = countCarriedCoins(snapshot.items);
    const plan = planMoneySpend(
      carried,
      Math.min(countMoneyWorth(carried), totalCost),
    );
    if (!plan) return "failed";
    const paymentWeight =
      plan.goldSpent * this.itemWeight(GOLD_COIN_TYPE_ID) +
      plan.platinumSpent * this.itemWeight(PLATINUM_COIN_TYPE_ID) +
      plan.crystalSpent * this.itemWeight(CRYSTAL_COIN_TYPE_ID) -
      plan.goldChange * this.itemWeight(GOLD_COIN_TYPE_ID) -
      plan.platinumChange * this.itemWeight(PLATINUM_COIN_TYPE_ID);
    const weightAfter =
      this.usedWeight(snapshot.items) - paymentWeight + unitWeight * amount;
    if (weightAfter > snapshot.capacityMax * 100) {
      return "no-capacity";
    }
    return null;
  }

  precheckSale(
    player: Player,
    unitWeight: number,
    amount: number,
    totalProceeds: number,
    currencyItemTypeId?: number,
  ): ShopActionFailedReason | null {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return "failed";
    if (currencyItemTypeId !== undefined) {
      const weightAfter =
        this.usedWeight(snapshot.items) -
        unitWeight * amount +
        this.itemWeight(currencyItemTypeId) * totalProceeds;
      return weightAfter > snapshot.capacityMax * 100 ? "no-capacity" : null;
    }
    const grant = planMoneyGrant(totalProceeds);
    const proceedsWeight =
      grant.gold * this.itemWeight(GOLD_COIN_TYPE_ID) +
      grant.platinum * this.itemWeight(PLATINUM_COIN_TYPE_ID) +
      grant.crystal * this.itemWeight(CRYSTAL_COIN_TYPE_ID);
    const weightAfter =
      this.usedWeight(snapshot.items) - unitWeight * amount + proceedsWeight;
    return weightAfter > snapshot.capacityMax * 100 ? "no-capacity" : null;
  }

  countSellable(
    player: Player,
    itemTypeId: number,
    subtype?: ShopItemSubtype,
  ): number {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return 0;
    const parentIds = new Set(
      snapshot.items.flatMap((item) =>
        item.location.kind === "container" || item.location.kind === "corpse"
          ? [item.location.containerId]
          : [],
      ),
    );
    return snapshot.items
      .filter(
        (item) =>
          item.typeId === itemTypeId &&
          item.location.kind !== "equipment" &&
          !parentIds.has(item.id) &&
          itemHasShopSubtype(item, subtype),
      )
      .reduce((total, item) => total + item.count, 0);
  }

  private usedWeight(items: ReadonlyArray<Item>): number {
    return items.reduce(
      (total, item) => total + this.itemWeight(item.typeId) * item.count,
      0,
    );
  }

  private itemWeight(typeId: number): number {
    return this.items.itemType(typeId)?.weight ?? 0;
  }
}
