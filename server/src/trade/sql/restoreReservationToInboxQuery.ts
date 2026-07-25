/**
 * Moves a stranded reservation root straight into its owner's inbox. A single
 * guarded UPDATE: the row keeps its identity and its nested contents follow it
 * untouched, so there is no copy-then-delete window (charter rule 2). The
 * `location_type` guard makes a replay a no-op rather than a second move.
 */
export const restoreReservationToInboxQuery = `UPDATE items
       SET location_type = 'inbox', slot_index = $3,
           version = version + 1, updated_at = now()
       WHERE id = $1
         AND character_id = $2
         AND location_type = 'trade-reservation'
       RETURNING id, version`;
