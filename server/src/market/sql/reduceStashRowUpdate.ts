/**
 * Decrements the counter. `supply_stash.count` is constrained to 1 or more,
 * so a draw that empties the stash deletes the row instead — see
 * `drawFromStash`, which picks between the two.
 */
export const reduceStashRowUpdate = `UPDATE supply_stash
       SET count = count - $3, updated_at = now()
       WHERE character_id = $1 AND item_type_id = $2 AND count > $3`;
