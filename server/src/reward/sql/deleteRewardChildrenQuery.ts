export const deleteRewardChildrenQuery = `DELETE FROM items
       WHERE container_id = ANY($1::uuid[]) AND location_type = 'container'`;
