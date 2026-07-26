/** Version-guarded tier write into the item's attribute bag. */
export const updateForgeItemTierQuery = `UPDATE items
       SET attributes = CASE
             WHEN $3::integer > 0 THEN jsonb_set(attributes, '{tier}', to_jsonb($3::integer))
             ELSE attributes - 'tier'
           END,
           version = version + 1,
           updated_at = now()
       WHERE id = $1 AND version = $2
       RETURNING id, item_type_id, count, attributes, version, location_type,
                 character_id, container_id, slot_index, equipment_slot, seed_key`;
