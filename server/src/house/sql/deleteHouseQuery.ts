export const deleteHouseQuery = `
  DELETE FROM houses WHERE house_id = $1 AND tenancy_id = $2`;
