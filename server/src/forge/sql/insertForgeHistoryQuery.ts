export const insertForgeHistoryQuery = `INSERT INTO forge_history (
         character_id, action, convergence, success, bonus, tier,
         description, cost_gold, cost_dust, cost_cores, gained
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
