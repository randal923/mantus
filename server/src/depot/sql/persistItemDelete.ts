export const persistItemDelete = `DELETE FROM items
       WHERE id = $1 AND version = $2`;
