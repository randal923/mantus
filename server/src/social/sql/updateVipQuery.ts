export const updateVipQuery = `
  UPDATE character_vips SET
    description = COALESCE($3, description),
    icon = COALESCE($4, icon),
    notify_login = COALESCE($5, notify_login)
  WHERE character_id = $1 AND vip_character_id = $2`;
