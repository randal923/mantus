import {
  countMoneyWorth,
  GOLD_COIN_TYPE_ID,
  type InventoryState,
} from "@tibia/protocol";

export interface ShopMoneyInput {
  readonly currencyItemTypeId: number;
  /** Carried units of a custom shop currency, projected by the server. */
  readonly currencyAmount: number;
  readonly bankBalance: number;
  readonly inventory: Pick<InventoryState, "gold" | "platinum" | "crystal">;
}

/**
 * What the player can spend at this shop right now.
 *
 * A gold shop draws on carried coins first and the bank for the shortfall, so
 * both count — the same sum Canary shows as "Gold:". A custom currency has no
 * bank denomination, so only the carried units count.
 */
export function shopMoneyAvailable(input: ShopMoneyInput): number {
  if (input.currencyItemTypeId !== GOLD_COIN_TYPE_ID) {
    return input.currencyAmount;
  }
  return (
    countMoneyWorth({
      gold: input.inventory.gold,
      platinum: input.inventory.platinum,
      crystal: input.inventory.crystal,
    }) + input.bankBalance
  );
}
