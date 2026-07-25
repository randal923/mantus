/**
 * Reconciles one offer's durable stock row with the catalog. An unchanged
 * schedule keeps its existing deadline, so a restart mid-interval does not
 * push the next restock out — that is what makes "restocks exactly once per
 * boundary" survive restarts.
 */
export const seedShopRestockQuery = `
  INSERT INTO shop_stock (
    shop_id, offer_id, initial_stock, remaining_stock,
    restock_interval_seconds, restock_at
  ) VALUES (
    $1, $2, $3, $3, $4,
    CASE WHEN $4::integer IS NULL
      THEN NULL
      ELSE now() + make_interval(secs => $4::integer)
    END
  )
  ON CONFLICT (shop_id, offer_id) DO UPDATE
  SET initial_stock = excluded.initial_stock,
      remaining_stock = least(shop_stock.remaining_stock, excluded.initial_stock),
      restock_interval_seconds = excluded.restock_interval_seconds,
      restock_at = CASE
        WHEN shop_stock.restock_interval_seconds
             IS DISTINCT FROM excluded.restock_interval_seconds
          THEN excluded.restock_at
        ELSE shop_stock.restock_at
      END,
      version = shop_stock.version + 1,
      updated_at = now()
  WHERE shop_stock.initial_stock IS DISTINCT FROM excluded.initial_stock
     OR shop_stock.restock_interval_seconds
        IS DISTINCT FROM excluded.restock_interval_seconds`;
