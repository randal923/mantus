import { itemColumns } from "./itemColumns";

export const rotateItemUpdate = `UPDATE items
         SET item_type_id = $2, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${itemColumns}`;
