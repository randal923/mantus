export const bumpStashRevisionUpdate = `UPDATE character_storage_state
         SET stash_revision = stash_revision + 1, updated_at = now()
         WHERE character_id = $1`;
