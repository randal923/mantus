export const moderationCharacterByNameQuery = `
  SELECT id, display_name, account_id FROM characters
  WHERE normalized_name = lower(btrim($1))`;
