/**
 * The acting character's membership, rank level, and guild ownership,
 * locked for the duration of the transaction so permission is re-checked
 * against committed truth at execution time (charter rule 4).
 */
export const actorMembershipForUpdateQuery = `
  SELECT gm.character_id, gm.guild_id, gr.level, g.owner_character_id
  FROM guild_members gm
  JOIN guild_ranks gr ON gr.id = gm.rank_id
  JOIN guilds g ON g.id = gm.guild_id
  WHERE gm.character_id = $1
  FOR UPDATE OF gm`;
