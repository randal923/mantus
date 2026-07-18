export const rewardDeliveryInsert = `INSERT INTO inbox_deliveries (
           delivery_key, delivery_kind, recipient_character_id,
           item_id, original_item_id
         ) VALUES ($1, 'reward', $2, $3, $3)`;
