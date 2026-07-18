export const stashTotalCountQuery = `SELECT count(*)::text AS count
       FROM supply_stash WHERE character_id = $1`;
