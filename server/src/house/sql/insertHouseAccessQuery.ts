export const insertHouseAccessQuery = `
  INSERT INTO house_access (house_id, kind, character_id)
  VALUES ($1, $2, $3)
  ON CONFLICT DO NOTHING`;
