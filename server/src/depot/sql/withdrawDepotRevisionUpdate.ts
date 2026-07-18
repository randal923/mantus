export const withdrawDepotRevisionUpdate = `UPDATE character_depots
           SET revision = revision + 1, updated_at = now()
           WHERE character_id = $1 AND depot_id = $2`;
