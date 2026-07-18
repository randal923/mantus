export const mailStorageStateForUpdateQuery = `SELECT inbox_revision, stash_revision
         FROM character_storage_state
         WHERE character_id = $1 FOR UPDATE`;
