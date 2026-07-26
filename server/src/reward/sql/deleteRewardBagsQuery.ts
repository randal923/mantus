export const deleteRewardBagsQuery = `DELETE FROM items
       WHERE id = ANY($1::uuid[]) AND location_type = 'reward'`;
