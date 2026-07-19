export const houseAccessRowsQuery = `
  SELECT ha.house_id, ha.kind, ha.character_id, c.display_name
  FROM house_access ha
  JOIN characters c ON c.id = ha.character_id
  ORDER BY ha.house_id, ha.kind, c.display_name`;
