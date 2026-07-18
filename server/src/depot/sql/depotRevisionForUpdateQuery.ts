export const depotRevisionForUpdateQuery = `SELECT revision FROM character_depots
       WHERE character_id = $1 AND depot_id = $2 FOR UPDATE`;
