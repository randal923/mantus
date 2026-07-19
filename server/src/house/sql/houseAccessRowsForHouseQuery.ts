export const houseAccessRowsForHouseQuery = `
  SELECT ha.house_id, ha.kind, ha.character_id, c.display_name
  FROM house_access ha
  JOIN characters c ON c.id = ha.character_id
  WHERE ha.house_id = $1
  ORDER BY ha.kind, c.display_name`;
