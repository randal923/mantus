export const adjustFragmentsQuery = `UPDATE character_gem_resources SET
         lesser_fragments = lesser_fragments + CASE WHEN $2 = 0 THEN $3::int ELSE 0 END,
         greater_fragments = greater_fragments + CASE WHEN $2 = 1 THEN $3::int ELSE 0 END,
         updated_at = now()
       WHERE character_id = $1
         AND (CASE WHEN $2 = 0 THEN lesser_fragments
                   ELSE greater_fragments END) + $3::int >= 0`;
