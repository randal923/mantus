export const vipGroupRowsQuery = `
  SELECT id, name FROM character_vip_groups
  WHERE character_id = $1
  ORDER BY name
  LIMIT $2`;

export const countVipGroupsQuery = `
  SELECT count(*)::int AS total FROM character_vip_groups
  WHERE character_id = $1`;

export const insertVipGroupQuery = `
  INSERT INTO character_vip_groups (character_id, name)
  VALUES ($1, $2)
  RETURNING id, name`;

/** Scoped to the owner, so a forged group id from another list matches nothing. */
export const deleteVipGroupQuery = `
  DELETE FROM character_vip_groups WHERE id = $2 AND character_id = $1`;

/**
 * Assigns an entry to one of the owner's own groups. The group id is verified
 * against the same owner inside the statement, so it can never point at a
 * group belonging to someone else.
 */
export const assignVipGroupQuery = `
  UPDATE character_vips SET group_id = (
    SELECT g.id FROM character_vip_groups g
    WHERE g.id = $3::uuid AND g.character_id = $1
  )
  WHERE character_id = $1 AND vip_character_id = $2
    AND ($3::uuid IS NULL OR EXISTS (
      SELECT 1 FROM character_vip_groups g
      WHERE g.id = $3::uuid AND g.character_id = $1
    ))`;
