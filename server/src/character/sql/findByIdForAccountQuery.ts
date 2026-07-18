import { characterColumns } from "./characterColumns";

export const findByIdForAccountQuery = `SELECT ${characterColumns},
         coalesce(
           (
             SELECT json_agg(
               json_build_object(
                 'skill', skill,
                 'level', level,
                 'tries', tries::text
               )
               ORDER BY skill
             )
             FROM character_skills
             WHERE character_id = characters.id
           ),
           '[]'::json
         ) AS skills,
         coalesce(
           (
             SELECT array_agg(event_id ORDER BY occurred_at, event_id)
             FROM progression_events
             WHERE character_id = characters.id
           ),
           ARRAY[]::varchar[]
         ) AS progression_event_ids,
         coalesce(
           (
             SELECT jsonb_object_agg(storage_key, storage_value)
             FROM character_storages
             WHERE character_id = characters.id
           ),
           '{}'::jsonb
         ) AS storage_values
       FROM characters
       WHERE id = $1 AND account_id = $2`;
