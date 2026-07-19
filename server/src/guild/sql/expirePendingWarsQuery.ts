/** Rejects pending declarations older than the cutoff (lazy 72 h expiry). */
export const expirePendingWarsQuery = `
  UPDATE guild_wars
  SET status = 2, ended_at = now()
  WHERE status = 0 AND started_at < $1
  RETURNING id, guild1_id, guild2_id`;
