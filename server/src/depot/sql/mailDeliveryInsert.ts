export const mailDeliveryInsert = `INSERT INTO inbox_deliveries (
           delivery_key, delivery_kind, recipient_character_id,
           return_character_id, item_id, original_item_id, expires_at
         ) VALUES ($1, 'mail', $2, $3, $4, $4, $5)`;
