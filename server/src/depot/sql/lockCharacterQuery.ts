export const lockCharacterQuery =
  "SELECT id FROM characters WHERE id = $1 FOR UPDATE";
