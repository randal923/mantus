export const decrementStashCountUpdate = `UPDATE supply_stash
           SET count = count - $3, updated_at = now()
           WHERE character_id = $1 AND item_type_id = $2`;
