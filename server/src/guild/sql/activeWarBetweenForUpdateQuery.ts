/**
 * The single active war between two guilds, locked so concurrent
 * limit-reaching kills serialize on the row (exactly one end transition).
 */
export const activeWarBetweenForUpdateQuery = `
  SELECT id, guild1_id, guild2_id, status, frag_limit
  FROM guild_wars
  WHERE status = 1
    AND ((guild1_id = $1 AND guild2_id = $2)
      OR (guild1_id = $2 AND guild2_id = $1))
  FOR UPDATE`;
