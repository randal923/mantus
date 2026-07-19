export const updateGuildMotdQuery = `
  UPDATE guilds SET motd = $2 WHERE id = $1`;
