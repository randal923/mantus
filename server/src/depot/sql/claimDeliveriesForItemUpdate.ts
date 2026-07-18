export const claimDeliveriesForItemUpdate = `UPDATE inbox_deliveries
           SET status = 'claimed', completed_at = now()
           WHERE status = 'delivered'
             AND (item_id = $1 OR original_item_id = $1)`;
