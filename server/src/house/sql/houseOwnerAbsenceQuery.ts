/** The owner's absence anchor and premium tier, re-read at execution time. */
export const houseOwnerAbsenceQuery = `
  SELECT c.last_seen_at, a.premium_until
  FROM characters c
  JOIN accounts a ON a.id = c.account_id
  WHERE c.id = $1`;
