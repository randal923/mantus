/**
 * Refills every offer whose deadline has passed and advances that deadline to
 * the first boundary strictly after now, so a downtime spanning several
 * intervals still restocks exactly once. The `restock_at <= now()` guard is
 * re-evaluated after the row lock is taken, so a concurrent sweep on another
 * server updates nothing.
 *
 * Rows already at full stock advance their deadline too — leaving them behind
 * would keep them permanently "due" and re-scanned on every sweep.
 */
export const restockDueOffersQuery = `
  UPDATE shop_stock
  SET remaining_stock = initial_stock,
      restock_at = restock_at + (
        floor(
          extract(epoch from (now() - restock_at)) / restock_interval_seconds
        )::bigint + 1
      ) * make_interval(secs => restock_interval_seconds),
      version = version + 1,
      updated_at = now()
  WHERE restock_at IS NOT NULL
    AND restock_at <= now()
  RETURNING shop_id, offer_id`;
