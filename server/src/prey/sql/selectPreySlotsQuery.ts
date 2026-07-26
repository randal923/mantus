export const selectPreySlotsQuery = `SELECT slot, state, grid, selected_race_id, bonus_type, bonus_rarity,
              bonus_percentage, bonus_time_left, free_reroll_at, reroll_option
       FROM character_prey_slots
       WHERE character_id = $1
       ORDER BY slot`;
