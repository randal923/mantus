export const houseRowForUpdateQuery = `
  SELECT house_id, owner_character_id, tenancy_id, paid_until, rent_warnings
  FROM houses
  WHERE house_id = $1
  FOR UPDATE`;
