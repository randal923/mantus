import { MARKET_LIMITS } from "@tibia/protocol";

/** Deterministic integer fee: 2% of the total, clamped to [20, 1_000_000]. */
export function marketFeeOf(totalPrice: number): number {
  const percent = Math.floor(
    (totalPrice * MARKET_LIMITS.feeBasisPoints) / 10_000,
  );
  return Math.min(
    MARKET_LIMITS.feeMaximum,
    Math.max(MARKET_LIMITS.feeMinimum, percent),
  );
}
