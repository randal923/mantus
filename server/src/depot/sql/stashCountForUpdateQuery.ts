export const stashCountForUpdateQuery = `SELECT count::text AS count
         FROM supply_stash
         WHERE character_id = $1 AND item_type_id = $2
         FOR UPDATE`;
