export const debitForgeDustsQuery = `UPDATE character_forge_resources
       SET dusts = dusts - $2
       WHERE character_id = $1 AND dusts >= $2
       RETURNING dusts, dust_level`;
