/** Version-guarded replacement of the item's whole attribute bag. */
export const updateImbuedItemQuery = `UPDATE items
       SET attributes = $3::jsonb, version = version + 1, updated_at = now()
       WHERE id = $1 AND version = $2
       RETURNING id, item_type_id, count, attributes, version, location_type,
                 character_id, container_id, slot_index, equipment_slot, seed_key`;
