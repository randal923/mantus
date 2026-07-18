export const decrementItemCountQuery = `UPDATE items
           SET count = count - $2, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $3
           RETURNING version`;
