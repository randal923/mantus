/**
 * Coin rows that appeared without any audit trail at all. Bounded to rows
 * created after `$4` so world-seeded and pre-audit rows cannot false-positive:
 * the sweep only judges what it has been watching.
 */
export const orphanCoinRowsQuery = `
  SELECT id, item_type_id, count
  FROM items
  WHERE item_type_id IN ($1, $2, $3)
    AND created_at > $4
    AND seed_key IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM audit_log WHERE audit_log.item_id = items.id
    )
  ORDER BY created_at
  LIMIT $5`;
