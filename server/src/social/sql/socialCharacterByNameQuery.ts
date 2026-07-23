export const socialCharacterByNameQuery = `
  SELECT id, display_name, level, vocation FROM characters
  WHERE normalized_name = lower(btrim($1))`;
