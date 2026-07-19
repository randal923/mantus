export const houseRowsQuery = `
  SELECT h.house_id, h.owner_character_id, h.tenancy_id, h.paid_until,
         h.rent_warnings, c.display_name AS owner_name
  FROM houses h
  JOIN characters c ON c.id = h.owner_character_id
  ORDER BY h.house_id`;
