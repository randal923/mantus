export const insertHouseEvictionDeliveryQuery = `
  INSERT INTO inbox_deliveries (
    delivery_key, delivery_kind, recipient_character_id, item_id,
    original_item_id
  ) VALUES ($1, 'system', $2, null, $3)
  ON CONFLICT (delivery_key) DO NOTHING`;
