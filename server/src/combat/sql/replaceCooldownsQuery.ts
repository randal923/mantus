export const replaceCooldownsQuery = `
  WITH deleted AS (
    DELETE FROM character_spell_cooldowns
    WHERE character_id = $1
  )
  INSERT INTO character_spell_cooldowns (
    character_id,
    cooldown_key,
    ready_at,
    total_ms
  )
  SELECT
    $1,
    entry.cooldown_key,
    entry.ready_at,
    entry.total_ms
  FROM jsonb_to_recordset($2::jsonb)
    AS entry(cooldown_key varchar, ready_at bigint, total_ms integer)
`;
