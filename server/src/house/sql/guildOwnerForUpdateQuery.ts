/** Locks the guild row and returns its current leader for a re-check. */
export const guildOwnerForUpdateQuery = `
  SELECT owner_character_id, balance::text AS balance
  FROM guilds WHERE id = $1 FOR UPDATE`;
