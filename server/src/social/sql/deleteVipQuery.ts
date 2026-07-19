export const deleteVipQuery = `
  DELETE FROM character_vips
  WHERE character_id = $1 AND vip_character_id = $2`;
