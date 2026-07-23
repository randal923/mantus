export const incrementOwnedItemWithAuditQuery = `
  WITH updated AS (
    UPDATE items
    SET count = count + $2, version = version + 1, updated_at = now()
    WHERE id = $1 AND version = $3
    RETURNING id, version
  ),
  audited AS (
    INSERT INTO audit_log(event_type, character_id, item_id, details)
    SELECT
      'item-created',
      $4,
      id,
      jsonb_build_object(
        'itemTypeId', $5::integer,
        'count', $2::integer,
        'reason', $6::text
      )
    FROM updated
    RETURNING item_id
  )
  SELECT updated.version
  FROM updated
  JOIN audited ON audited.item_id = updated.id`;
