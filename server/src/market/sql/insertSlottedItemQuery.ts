import { depotItemColumns } from "../../depot/sql/depotItemColumns";

/** Inserts one character-slotted row (market-escrow or inbox splits). */
export const insertSlottedItemQuery = `INSERT INTO items (
         id, item_type_id, count, attributes, location_type, character_id,
         slot_index
       ) VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $6)
       RETURNING ${depotItemColumns}`;
