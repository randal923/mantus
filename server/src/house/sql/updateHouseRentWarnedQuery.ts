export const updateHouseRentWarnedQuery = `
  UPDATE houses
  SET paid_until = $2, rent_warnings = $3, updated_at = now()
  WHERE house_id = $1`;
