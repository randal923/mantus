export const deleteItemRowQuery =
  "DELETE FROM items WHERE id = $1 AND version = $2 RETURNING id";
