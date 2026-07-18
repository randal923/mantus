export const rewardDeliveryByKeyQuery = `SELECT delivery_kind, recipient_character_id, return_character_id,
           item_id, original_item_id, status
         FROM inbox_deliveries
         WHERE delivery_key = $1`;
