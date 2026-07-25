export const countHouseDoorListsQuery = `
  SELECT count(*)::int AS total FROM house_lists
  WHERE house_id = $1 AND kind = 2`;
