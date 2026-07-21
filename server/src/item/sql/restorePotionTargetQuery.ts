export const restorePotionTargetQuery = `UPDATE characters
       SET health = LEAST($3, health + $4),
           mana = LEAST($5, mana + $6),
           version = version + 1,
           updated_at = now()
       WHERE id = $1 AND version = $2
         AND health = $7 AND mana = $8
       RETURNING version, health, mana`;
