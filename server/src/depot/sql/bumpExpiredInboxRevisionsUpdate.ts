export const bumpExpiredInboxRevisionsUpdate = `UPDATE character_storage_state
           SET inbox_revision = inbox_revision + 1, updated_at = $2
           WHERE character_id = ANY($1::uuid[])`;
