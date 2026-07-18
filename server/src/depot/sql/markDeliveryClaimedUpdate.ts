export const markDeliveryClaimedUpdate = `UPDATE inbox_deliveries
             SET status = 'claimed', completed_at = $2
             WHERE delivery_key = $1`;
