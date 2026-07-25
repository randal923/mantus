/** Economy audit for a chest reward grant (charter rule 11). */
export const insertChestLootAuditQuery = `
  INSERT INTO audit_log(event_type, character_id, details)
  VALUES (
    'chest-loot',
    $1,
    jsonb_build_object(
      'chestUniqueId', $2::integer,
      'lootedKey', $3::text,
      'rewards', $4::jsonb,
      'containerTypeId', $5::integer
    )
  )`;
