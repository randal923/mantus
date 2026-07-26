export const selectForgeHistoryQuery = `SELECT action, convergence, success, bonus, tier, description,
              cost_gold, cost_dust, cost_cores, gained,
              (extract(epoch from created_at) * 1000)::bigint AS created_at_ms
       FROM forge_history
       WHERE character_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`;
