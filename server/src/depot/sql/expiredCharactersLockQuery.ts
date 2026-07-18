export const expiredCharactersLockQuery = `SELECT id FROM characters
           WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`;
