/**
 * Deletes cleaned ground items and everything inside them, auditing exactly
 * the rows that existed. The recursive term covers contents the caller did not
 * name (a bag dropped with items in it), so the `container_id` restrict
 * constraint never blocks the parent delete; the `location_type` guard makes
 * a row that has since become carried untouchable. Memory-only loot passes
 * through as a no-op: no row, no audit.
 */
export const deleteCleanedWorldItems = `WITH RECURSIVE doomed(id) AS (
         SELECT id FROM items
          WHERE id = ANY($1::uuid[]) AND location_type = 'world'
          UNION
         SELECT child.id FROM items child JOIN doomed ON child.container_id = doomed.id
       ), removed AS (
         DELETE FROM items WHERE id IN (SELECT id FROM doomed)
          RETURNING id, item_type_id, count
       )
       INSERT INTO audit_log(event_type, character_id, item_id, details)
       SELECT 'item-destroyed', null, removed.id,
              jsonb_build_object(
                'itemTypeId', removed.item_type_id,
                'count', removed.count,
                'reason', 'map-clean'
              )
         FROM removed`;
