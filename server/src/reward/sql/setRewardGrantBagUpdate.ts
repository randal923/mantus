export const setRewardGrantBagUpdate = `UPDATE reward_grants
       SET bag_item_id = $2
       WHERE grant_key = $1`;
