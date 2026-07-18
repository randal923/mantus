export const bumpInboxRevisionUpdate = `UPDATE character_storage_state
         SET inbox_revision = inbox_revision + 1, updated_at = now()
         WHERE character_id = $1`;
