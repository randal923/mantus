export const updateCharacterSnapshotQuery = `UPDATE characters
         SET level = $3, experience = $4, magic_level = $5, mana_spent = $6,
             health = $7, mana = $8, soul = $9, position_x = $10,
             position_y = $11, position_z = $12, direction = $13,
             outfit_look_type = $14, outfit_head = $15, outfit_body = $16,
             outfit_legs = $17, outfit_feet = $18, outfit_addons = $19,
             updated_at = now(), version = version + 1
         WHERE id = $1 AND version = $2
           AND vocation = $20 AND progression_definition_version = $21
         RETURNING version`;
