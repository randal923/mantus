/**
 * Locks the character's stash counter for one item type. Taken inside the
 * offer's own transaction so a racing create cannot escrow the same units
 * twice — the second waits here and then re-reads the reduced count.
 */
export const lockStashRowQuery = `SELECT count FROM supply_stash
       WHERE character_id = $1 AND item_type_id = $2
       FOR UPDATE`;
