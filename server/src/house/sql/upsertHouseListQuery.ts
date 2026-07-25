export const upsertHouseListQuery = `
  INSERT INTO house_lists (house_id, kind, door_x, door_y, door_z, body)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (house_id, kind, door_x, door_y, door_z)
  DO UPDATE SET body = EXCLUDED.body, updated_at = now()`;
