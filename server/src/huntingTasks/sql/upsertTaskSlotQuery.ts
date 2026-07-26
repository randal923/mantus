export const upsertTaskSlotQuery = `INSERT INTO character_task_slots (
         character_id, slot, state, grid, selected_race_id, upgrade, rarity,
         kills, disabled_until, free_reroll_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (character_id, slot) DO UPDATE SET
         state = excluded.state,
         grid = excluded.grid,
         selected_race_id = excluded.selected_race_id,
         upgrade = excluded.upgrade,
         rarity = excluded.rarity,
         kills = excluded.kills,
         disabled_until = excluded.disabled_until,
         free_reroll_at = excluded.free_reroll_at`;
