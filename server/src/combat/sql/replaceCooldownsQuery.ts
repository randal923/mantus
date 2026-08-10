// A `WITH deleted AS (DELETE ...) INSERT ...` full replace is not safe when a
// key survives into the new set: the INSERT's unique check can run before the
// CTE's DELETE removes the old row, raising duplicate_key (the sub-statements
// share one snapshot and their order is unspecified). Upsert the incoming rows
// and sweep the keys that dropped out instead — the two legs touch disjoint
// rows, so the same-statement hazard cannot recur.
export const replaceCooldownsQuery = `
  WITH incoming AS (
    SELECT entry.cooldown_key, entry.ready_at, entry.total_ms
    FROM jsonb_to_recordset($2::jsonb)
      AS entry(cooldown_key varchar, ready_at bigint, total_ms integer)
  ), upserted AS (
    INSERT INTO character_spell_cooldowns (
      character_id,
      cooldown_key,
      ready_at,
      total_ms
    )
    SELECT $1, incoming.cooldown_key, incoming.ready_at, incoming.total_ms
    FROM incoming
    ON CONFLICT (character_id, cooldown_key) DO UPDATE SET
      ready_at = EXCLUDED.ready_at,
      total_ms = EXCLUDED.total_ms
  )
  DELETE FROM character_spell_cooldowns
  WHERE character_id = $1
    AND cooldown_key NOT IN (SELECT incoming.cooldown_key FROM incoming)
`;
