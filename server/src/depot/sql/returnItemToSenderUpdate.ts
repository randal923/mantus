import { depotItemColumns } from "./depotItemColumns";

export const returnItemToSenderUpdate = `UPDATE items
           SET character_id = $2, slot_index = $3,
               version = version + 1, updated_at = $4
           WHERE id = $1
           RETURNING ${depotItemColumns}`;
