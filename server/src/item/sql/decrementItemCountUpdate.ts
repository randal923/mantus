import { itemColumns } from "./itemColumns";

export const decrementItemCountUpdate = `UPDATE items
         SET count = count - $2, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${itemColumns}`;
