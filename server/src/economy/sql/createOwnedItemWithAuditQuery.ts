export const createOwnedItemWithAuditQuery = `
  WITH created AS (
    INSERT INTO items (
      id, item_type_id, count, attributes, location_type, container_id,
      slot_index
    ) VALUES ($1, $2, $3, $4::jsonb, 'container', $5, $6)
    RETURNING id
  ),
  audited AS (
    INSERT INTO audit_log(event_type, character_id, item_id, details)
    SELECT
      'item-created',
      $7,
      id,
      jsonb_build_object(
        'itemTypeId', $2::integer,
        'count', $3::integer,
        'reason', $8::text
      )
    FROM created
    RETURNING item_id
  )
  SELECT created.id
  FROM created
  JOIN audited ON audited.item_id = created.id`;
