import { depotItemColumns } from "./depotItemColumns";

export const stashWithdrawItemInsert = `INSERT INTO items (
             id, item_type_id, count, location_type, character_id,
             container_id, slot_index
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${depotItemColumns}`;
