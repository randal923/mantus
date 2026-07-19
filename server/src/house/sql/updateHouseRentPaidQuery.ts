export const updateHouseRentPaidQuery = `
  UPDATE houses
  SET paid_until = $2, rent_warnings = 0, last_rent_charge_at = $3,
      updated_at = now()
  WHERE house_id = $1`;
