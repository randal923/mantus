export const createOwnedItemsWithAuditQuery = `
  WITH requested AS (
    SELECT id, slot_index
    FROM unnest($1::uuid[], $2::smallint[]) AS rows(id, slot_index)
  ),
  created AS (
    INSERT INTO items (
      id, item_type_id, count, attributes, location_type, container_id,
      slot_index
    )
    SELECT id, $3, 1, $4::jsonb, 'container', $5, slot_index
    FROM requested
    RETURNING id
  ),
  audited AS (
    INSERT INTO audit_log(event_type, character_id, item_id, details)
    SELECT
      'item-created',
      $6,
      id,
      jsonb_build_object(
        'itemTypeId', $3::integer,
        'count', 1,
        'reason', $7::text
      )
    FROM created
    RETURNING item_id
  )
  SELECT created.id
  FROM created
  JOIN audited ON audited.item_id = created.id`;
