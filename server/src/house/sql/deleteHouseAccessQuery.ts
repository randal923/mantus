export const deleteHouseAccessQuery = `
  DELETE FROM house_access
  WHERE house_id = $1 AND kind = $2 AND character_id = $3`;
