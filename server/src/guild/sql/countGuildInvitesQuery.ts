export const countGuildInvitesQuery = `
  SELECT count(*)::int AS total FROM guild_invites WHERE guild_id = $1`;
