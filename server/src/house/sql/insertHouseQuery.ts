export const insertHouseQuery = `
  INSERT INTO houses (house_id, owner_character_id, paid_until)
  VALUES ($1, $2, $3)
  RETURNING tenancy_id`;
