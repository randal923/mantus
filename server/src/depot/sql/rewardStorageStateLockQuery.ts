export const rewardStorageStateLockQuery = `SELECT character_id FROM character_storage_state
         WHERE character_id = $1 FOR UPDATE`;
