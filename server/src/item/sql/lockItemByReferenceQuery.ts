import { itemColumns } from "./itemColumns";

export const lockItemByReferenceQuery = `SELECT ${itemColumns}
       FROM items
       WHERE id::text = $1 OR seed_key = $1
       FOR UPDATE`;
