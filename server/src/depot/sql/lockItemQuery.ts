import { depotItemColumns } from "./depotItemColumns";

export const lockItemQuery = `SELECT ${depotItemColumns} FROM items WHERE id = $1 FOR UPDATE`;
