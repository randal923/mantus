import { itemColumns } from "../../item/sql/itemColumns";

export const rewardBagsQuery = `SELECT ${itemColumns}
       FROM items
       WHERE character_id = $1 AND location_type = 'reward'
       ORDER BY slot_index
       FOR UPDATE`;
