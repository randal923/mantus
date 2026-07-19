/** Open wars plus recently ended ones, with per-side kill tallies. */
export const guildWarsQuery = `
  SELECT w.id, w.guild1_id, w.guild2_id,
         g1.name AS guild1_name, g2.name AS guild2_name,
         w.status, w.frag_limit,
         (SELECT count(*) FROM guild_war_kills k
            WHERE k.war_id = w.id AND k.killer_guild_id = w.guild1_id)::int
           AS guild1_kills,
         (SELECT count(*) FROM guild_war_kills k
            WHERE k.war_id = w.id AND k.killer_guild_id = w.guild2_id)::int
           AS guild2_kills
  FROM guild_wars w
  JOIN guilds g1 ON g1.id = w.guild1_id
  JOIN guilds g2 ON g2.id = w.guild2_id
  WHERE (w.guild1_id = $1 OR w.guild2_id = $1)
    AND (w.status IN (0, 1)
      OR (w.status = 4 AND w.ended_at > now() - interval '7 days'))
  ORDER BY w.started_at DESC
  LIMIT 50`;
