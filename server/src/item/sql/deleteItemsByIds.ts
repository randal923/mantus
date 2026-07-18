export const deleteItemsByIds = "DELETE FROM items WHERE id = ANY($1::uuid[])";
