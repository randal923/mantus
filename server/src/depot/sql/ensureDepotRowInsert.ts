export const ensureDepotRowInsert = `INSERT INTO character_depots (character_id, depot_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`;
