/**
 * Winner eligibility read at close time: current level, current premium
 * expiry, current display name, and whether the character already owns a
 * house. Never the values captured when the bid was placed.
 */
export const houseBidderEligibilityQuery = `
  SELECT c.display_name,
         c.level,
         a.premium_until,
         EXISTS (
           SELECT 1 FROM houses h WHERE h.owner_character_id = c.id
         ) AS owns_house
  FROM characters c
  JOIN accounts a ON a.id = c.account_id
  WHERE c.id = $1`;
