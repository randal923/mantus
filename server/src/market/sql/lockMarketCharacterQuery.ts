export const lockMarketCharacterQuery = `SELECT id, account_id FROM characters WHERE id = $1 FOR UPDATE`;
