export const lockCharacterQuery = `SELECT level, vocation, progression_definition_version,
         version, mana, soul
       FROM characters WHERE id = $1 FOR UPDATE`;
