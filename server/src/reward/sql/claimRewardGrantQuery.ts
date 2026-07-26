// The exactly-once gate: the first statement of the grant transaction claims
// the (death event, recipient) key; no row back means the grant already ran.
export const claimRewardGrantQuery = `INSERT INTO reward_grants (grant_key, character_id)
       VALUES ($1, $2)
       ON CONFLICT (grant_key) DO NOTHING
       RETURNING grant_key`;
