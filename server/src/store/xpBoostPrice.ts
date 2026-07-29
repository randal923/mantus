/**
 * Canary's `GameStore.ExpBoostValues`: each XP boost bought on the same day
 * costs more than the last. The count is server-side state
 * (`character_store_limits.exp_boost_count`), and the price charged is
 * computed from the freshly locked row inside the purchase transaction — the
 * price the client displays is only a preview (charter rules 1 and 8).
 */
const XP_BOOST_PRICES = [30, 45, 90, 180, 360, 720] as const;

export function xpBoostPrice(purchasesToday: number): number {
  const index = Math.min(
    Math.max(0, Math.trunc(purchasesToday)),
    XP_BOOST_PRICES.length - 1,
  );
  return XP_BOOST_PRICES[index] ?? XP_BOOST_PRICES[0];
}
