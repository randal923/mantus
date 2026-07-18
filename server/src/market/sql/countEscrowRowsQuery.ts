export const countEscrowRowsQuery = `SELECT count(*)::int AS count
       FROM items
       WHERE character_id = $1 AND location_type = 'market-escrow'`;
