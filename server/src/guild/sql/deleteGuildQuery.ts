/** Ranks, memberships, invites, wars, and kills fall with the guild row. */
export const deleteGuildQuery = `
  DELETE FROM guilds WHERE id = $1`;
