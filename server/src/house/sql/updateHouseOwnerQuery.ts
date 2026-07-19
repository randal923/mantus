export const updateHouseOwnerQuery = `
  UPDATE houses
  SET owner_character_id = $2, tenancy_id = gen_random_uuid(),
      purchased_at = now(), paid_until = $3, rent_warnings = 0,
      last_rent_charge_at = null, updated_at = now()
  WHERE house_id = $1
  RETURNING tenancy_id`;
