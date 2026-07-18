export const firstFreeSlotQuery = `SELECT candidate.slot
       FROM generate_series(0, $3 - 1) AS candidate(slot)
       WHERE NOT EXISTS (
         SELECT 1 FROM items existing
         WHERE existing.character_id = $1
           AND existing.location_type = $2
           AND existing.slot_index = candidate.slot
           AND ($4::integer IS NULL OR existing.depot_id = $4)
       )
       ORDER BY candidate.slot
       LIMIT 1`;
