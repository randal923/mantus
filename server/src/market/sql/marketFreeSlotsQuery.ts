export const marketFreeSlotsQuery = `SELECT candidate.slot
       FROM generate_series(0, $3 - 1) AS candidate(slot)
       WHERE NOT EXISTS (
         SELECT 1 FROM items existing
         WHERE existing.character_id = $1
           AND existing.location_type = $2
           AND existing.slot_index = candidate.slot
       )
       ORDER BY candidate.slot
       LIMIT $4`;
