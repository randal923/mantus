/**
 * Coin worth minted and burned over a window, as recorded by the audit log.
 * `item-split` and `item-merged` move coins between rows without changing the
 * supply and are deliberately excluded; only creation and destruction move it.
 */
export const currencyAuditFlowQuery = `
  SELECT
    coalesce(sum(worth) FILTER (WHERE event_type = 'item-created'), 0)
      AS minted,
    coalesce(sum(worth) FILTER (WHERE event_type = 'item-destroyed'), 0)
      AS burned
  FROM (
    SELECT
      event_type,
      (details->>'count')::bigint * CASE (details->>'itemTypeId')::integer
        WHEN $1 THEN 1 WHEN $2 THEN $4::bigint WHEN $3 THEN $5::bigint
      END AS worth
    FROM audit_log
    WHERE event_type IN ('item-created', 'item-destroyed')
      AND occurred_at > $6
      AND occurred_at <= $7
      AND (details->>'itemTypeId')::integer IN ($1, $2, $3)
      AND jsonb_typeof(details->'count') = 'number'
  ) AS coin_events`;
