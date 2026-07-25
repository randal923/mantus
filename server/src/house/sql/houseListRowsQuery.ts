export const houseListRowsQuery = `
  SELECT house_id, kind, door_x, door_y, door_z, body
  FROM house_lists
  ORDER BY house_id, kind, door_x, door_y, door_z`;
