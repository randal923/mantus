export const expiredStorageStatesLockQuery = `SELECT character_id FROM character_storage_state
           WHERE character_id = ANY($1::uuid[]) ORDER BY character_id FOR UPDATE`;
