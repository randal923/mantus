import { itemColumns } from "../../item/sql/itemColumns";

export const rewardBagChildrenQuery = `SELECT ${itemColumns}
       FROM items
       WHERE container_id = ANY($1::uuid[]) AND location_type = 'container'
       ORDER BY container_id, slot_index
       FOR UPDATE`;
