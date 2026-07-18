import { depotItemColumns } from "../../depot/sql/depotItemColumns";

export const reduceItemCountUpdate = `UPDATE items
         SET count = count - $2, version = version + 1, updated_at = now()
         WHERE id = $1 AND count > $2
         RETURNING ${depotItemColumns}`;
