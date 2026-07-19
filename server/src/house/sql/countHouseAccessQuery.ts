export const countHouseAccessQuery = `
  SELECT count(*)::int AS total FROM house_access WHERE house_id = $1`;
