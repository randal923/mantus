export const deleteStashRow = `DELETE FROM supply_stash
           WHERE character_id = $1 AND item_type_id = $2`;
