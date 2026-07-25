export const houseListRowsForHouseQuery = `
  SELECT house_id, kind, door_x, door_y, door_z, body
  FROM house_lists
  WHERE house_id = $1
  ORDER BY kind, door_x, door_y, door_z`;
