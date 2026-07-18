import { itemColumns } from "./itemColumns";

export const lockItemsQuery = `SELECT ${itemColumns}
       FROM items
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`;
