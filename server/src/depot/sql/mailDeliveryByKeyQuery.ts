export const mailDeliveryByKeyQuery = `SELECT delivery.delivery_kind, delivery.recipient_character_id,
           delivery.return_character_id, delivery.item_id,
           delivery.original_item_id, delivery.status,
           recipient.display_name AS recipient_name
         FROM inbox_deliveries delivery
         JOIN characters recipient ON recipient.id = delivery.recipient_character_id
         WHERE delivery.delivery_key = $1`;
