export const ensureStorageStateInsert = `INSERT INTO character_storage_state (character_id)
       VALUES ($1) ON CONFLICT DO NOTHING`;
