export const deleteOwnedItemWithAuditQuery = `
  WITH deleted AS (
    DELETE FROM items
    WHERE id = $1 AND version = $2
    RETURNING id
  ),
  audited AS (
    INSERT INTO audit_log(event_type, character_id, item_id, details)
    SELECT
      'item-destroyed',
      $3,
      id,
      jsonb_build_object(
        'itemTypeId', $4::integer,
        'count', $5::integer,
        'reason', $6::text
      )
    FROM deleted
    RETURNING item_id
  )
  SELECT deleted.id
  FROM deleted
  JOIN audited ON audited.item_id = deleted.id`;
