/** Locks one war row; every status transition re-reads it first. */
export const warForUpdateQuery = `
  SELECT id, guild1_id, guild2_id, status, frag_limit
  FROM guild_wars
  WHERE id = $1
  FOR UPDATE`;
