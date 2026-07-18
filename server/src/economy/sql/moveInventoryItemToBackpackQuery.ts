export const moveInventoryItemToBackpackQuery = `UPDATE items
         SET location_type = 'container', character_id = null,
             container_id = $2, slot_index = $3,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $4
           AND character_id = $5 AND location_type = 'inventory'
         RETURNING version`;
