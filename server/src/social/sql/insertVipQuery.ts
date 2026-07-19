export const insertVipQuery = `
  INSERT INTO character_vips (character_id, vip_character_id)
  VALUES ($1, $2)`;
