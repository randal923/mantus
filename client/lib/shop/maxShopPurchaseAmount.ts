export interface ShopPurchaseLimitInput {
  readonly unitPrice: number;
  /** Unit weight in hundredths of an ounce. */
  readonly unitWeight: number;
  readonly availableMoney: number;
  /** Spare carry capacity in hundredths of an ounce. */
  readonly freeCapacity: number;
  readonly maximumAmount: number;
}

/**
 * How many of an offer the player can actually buy, mirroring OTClient's
 * amount slider: the offer's own cap, what the money covers, and what the
 * remaining capacity can hold, whichever is smallest.
 *
 * Because it is derived from live money and capacity, the slider re-clamps
 * itself after every purchase instead of letting the player send an amount the
 * server would refuse.
 */
export function maxShopPurchaseAmount(
  input: ShopPurchaseLimitInput,
): number {
  const byPrice =
    input.unitPrice <= 0
      ? input.maximumAmount
      : Math.floor(input.availableMoney / input.unitPrice);
  const byWeight =
    input.unitWeight <= 0
      ? input.maximumAmount
      : Math.floor(input.freeCapacity / input.unitWeight);
  return Math.max(0, Math.min(input.maximumAmount, byPrice, byWeight));
}
