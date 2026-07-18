export const markDeliveryReturnedUpdate = `UPDATE inbox_deliveries
           SET status = 'returned', completed_at = $2
           WHERE delivery_key = $1`;
