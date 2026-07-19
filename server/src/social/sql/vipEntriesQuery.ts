export const vipEntriesQuery = `
  SELECT
    v.vip_character_id,
    c.display_name,
    v.description,
    v.icon,
    v.notify_login
  FROM character_vips v
  JOIN characters c ON c.id = v.vip_character_id
  WHERE v.character_id = $1
  ORDER BY c.normalized_name
  LIMIT $2`;
