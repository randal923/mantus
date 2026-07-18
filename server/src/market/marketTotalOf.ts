import { MARKET_LIMITS } from "@tibia/protocol";

/**
 * amount * unitPrice as an exact integer, or null when it would exceed the
 * total-price cap. The guard runs before the multiplication so the product
 * can never leave the safe-integer range.
 */
export function marketTotalOf(amount: number, unitPrice: number): number | null {
  if (!Number.isInteger(amount) || !Number.isInteger(unitPrice)) return null;
  if (amount < 1 || unitPrice < 1) return null;
  if (unitPrice > Math.floor(MARKET_LIMITS.maxTotalPrice / amount)) return null;
  return amount * unitPrice;
}
