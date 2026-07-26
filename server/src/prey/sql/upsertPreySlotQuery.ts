export const upsertPreySlotQuery = `INSERT INTO character_prey_slots (
         character_id, slot, state, grid, selected_race_id, bonus_type,
         bonus_rarity, bonus_percentage, bonus_time_left, free_reroll_at,
         reroll_option
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (character_id, slot) DO UPDATE SET
         state = excluded.state,
         grid = excluded.grid,
         selected_race_id = excluded.selected_race_id,
         bonus_type = excluded.bonus_type,
         bonus_rarity = excluded.bonus_rarity,
         bonus_percentage = excluded.bonus_percentage,
         bonus_time_left = excluded.bonus_time_left,
         free_reroll_at = excluded.free_reroll_at,
         reroll_option = excluded.reroll_option`;
