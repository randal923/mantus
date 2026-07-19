/** One character's membership row with rank level, locked. */
export const membershipForUpdateQuery = `
  SELECT gm.character_id, gm.guild_id, gr.level
  FROM guild_members gm
  JOIN guild_ranks gr ON gr.id = gm.rank_id
  WHERE gm.character_id = $1
  FOR UPDATE OF gm`;
