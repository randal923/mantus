export const lockPotionCharactersQuery = `SELECT id, level, vocation,
         progression_definition_version, version, health, mana
       FROM characters
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`;
