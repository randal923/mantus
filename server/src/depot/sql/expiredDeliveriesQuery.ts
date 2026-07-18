export const expiredDeliveriesQuery = `SELECT delivery_key, delivery_kind, recipient_character_id,
         return_character_id, item_id, original_item_id, status, expires_at
       FROM inbox_deliveries
       WHERE status = 'delivered' AND expires_at <= $1
       ORDER BY expires_at, delivery_key
       LIMIT $2`;
