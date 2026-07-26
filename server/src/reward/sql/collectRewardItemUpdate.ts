import { itemColumns } from "../../item/sql/itemColumns";

// The version guard is belt-and-braces: the row is already FOR UPDATE-locked
// by the same transaction, so a miss indicates a logic error, not a race.
export const collectRewardItemUpdate = `UPDATE items
       SET location_type = 'container', container_id = $2, slot_index = $3,
           character_id = NULL, version = version + 1, updated_at = now()
       WHERE id = $1 AND version = $4
       RETURNING ${itemColumns}`;
