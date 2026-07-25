/**
 * Records the stash counter turning into an escrow row. One atomic move: the
 * counter is decremented and the row minted in the same transaction, never
 * copy-then-delete (charter rule 2).
 */
export const insertStashEscrowAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-created', $1, $2,
         jsonb_build_object(
           'operation', 'market-stash-escrow',
           'itemTypeId', $3::integer, 'count', $4::integer
         )
       )`;
