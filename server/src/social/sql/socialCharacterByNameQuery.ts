export const socialCharacterByNameQuery = `
  SELECT id, display_name FROM characters
  WHERE normalized_name = lower(btrim($1))`;
