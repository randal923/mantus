export const updateWarStatusQuery = `
  UPDATE guild_wars
  SET status = $2,
      ended_at = CASE WHEN $2 IN (2, 3, 4) THEN now() ELSE ended_at END,
      winner_guild_id = $3
  WHERE id = $1`;
