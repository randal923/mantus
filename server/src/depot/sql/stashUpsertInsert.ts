export const stashUpsertInsert = `INSERT INTO supply_stash (character_id, item_type_id, count)
         VALUES ($1, $2, $3)
         ON CONFLICT (character_id, item_type_id)
         DO UPDATE SET count = EXCLUDED.count, updated_at = now()`;
