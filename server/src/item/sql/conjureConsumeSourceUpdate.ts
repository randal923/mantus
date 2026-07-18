import { itemColumns } from "./itemColumns";

export const conjureConsumeSourceUpdate = `UPDATE items
           SET count = count - 1, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}`;
