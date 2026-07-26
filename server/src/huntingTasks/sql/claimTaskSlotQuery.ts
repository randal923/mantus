/**
 * The claim's exactly-once guard: the erase only lands if the durable row
 * still shows the expected selection with enough kills in a claimable
 * state, so two racing claims see one winner (charter rule 4).
 */
export const claimTaskSlotQuery = `UPDATE character_task_slots SET
         state = $5,
         grid = $6,
         selected_race_id = NULL,
         upgrade = false,
         rarity = $7,
         kills = 0,
         disabled_until = $8,
         free_reroll_at = $9
       WHERE character_id = $1 AND slot = $2 AND selected_race_id = $3
         AND kills >= $4 AND state IN ('active', 'completed')`;
