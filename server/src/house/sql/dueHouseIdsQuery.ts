export const dueHouseIdsQuery = `
  SELECT house_id FROM houses
  WHERE paid_until <= $1
  ORDER BY paid_until ASC
  LIMIT $2`;
