export const deliveryForUpdateQuery = `SELECT delivery_kind, recipient_character_id,
             return_character_id, item_id, original_item_id, status, expires_at
           FROM inbox_deliveries
           WHERE delivery_key = $1
           FOR UPDATE`;
