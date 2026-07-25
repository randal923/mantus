export const deleteHouseListQuery = `
  DELETE FROM house_lists
  WHERE house_id = $1 AND kind = $2
    AND door_x = $3 AND door_y = $4 AND door_z = $5`;
