import {
  GOLD_COIN_TYPE_ID,
  planMoneyGrant,
  type InventoryState,
  type ShopActionFailedReason,
} from "@tibia/protocol";
import type { ShopCoinWeights } from "./ShopCoinWeights";

export interface ShopSaleCheckInput {
  readonly unitWeight: number;
  readonly amount: number;
  readonly totalProceeds: number;
  readonly currencyItemTypeId: number;
  readonly currencyWeight: number;
  readonly coinWeights: ShopCoinWeights;
  readonly inventory: Pick<InventoryState, "usedWeight" | "capacityMax">;
}

/**
 * Client mirror of the server's sale precheck: the exact weight after the
 * goods leave and the proceeds coins arrive. Ownership is not checked here —
 * items inside closed containers are sellable but invisible to the client.
 */
export function precheckShopSale(
  input: ShopSaleCheckInput,
): ShopActionFailedReason | null {
  const proceedsWeight =
    input.currencyItemTypeId !== GOLD_COIN_TYPE_ID
      ? input.currencyWeight * input.totalProceeds
      : (() => {
          const grant = planMoneyGrant(input.totalProceeds);
          return (
            grant.gold * input.coinWeights.gold +
            grant.platinum * input.coinWeights.platinum +
            grant.crystal * input.coinWeights.crystal
          );
        })();
  const weightAfter =
    input.inventory.usedWeight -
    input.unitWeight * input.amount +
    proceedsWeight;
  return weightAfter > input.inventory.capacityMax * 100
    ? "no-capacity"
    : null;
}
