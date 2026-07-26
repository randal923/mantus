export const selectTaskSlotsQuery = `SELECT slot, state, grid, selected_race_id, upgrade, rarity, kills,
              disabled_until, free_reroll_at
       FROM character_task_slots
       WHERE character_id = $1
       ORDER BY slot`;
