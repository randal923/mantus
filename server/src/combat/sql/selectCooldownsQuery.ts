export const selectCooldownsQuery = `SELECT cooldown_key, ready_at, total_ms
     FROM character_spell_cooldowns
     WHERE character_id = $1`;
