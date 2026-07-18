export const extendDeliveryExpiryUpdate = `UPDATE inbox_deliveries
             SET expires_at = $2::timestamptz + interval '1 day'
             WHERE delivery_key = $1`;
