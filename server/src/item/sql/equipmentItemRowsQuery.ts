import { itemColumns } from "./itemColumns";

// No FOR UPDATE: callers hold the character row lock, which serializes every
// item transaction for the character, so these rows cannot change under us.
export const equipmentItemRowsQuery = `SELECT ${itemColumns}
       FROM items
       WHERE character_id = $1 AND location_type = 'equipment'`;
