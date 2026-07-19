export const countVipEntriesQuery = `
  SELECT count(*)::int AS total FROM character_vips
  WHERE character_id = $1`;
