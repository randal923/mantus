export const conjureCharacterResourcesUpdate = `UPDATE characters
         SET mana = mana - $3, soul = soul - $4,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $2
           AND mana = $5 AND soul = $6
         RETURNING version`;
