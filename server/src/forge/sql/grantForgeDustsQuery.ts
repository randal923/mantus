/** Kill-credit dust, clamped to the cap in SQL (Canary exaltation_forge.lua). */
export const grantForgeDustsQuery = `UPDATE character_forge_resources
       SET dusts = LEAST(dust_level, dusts + $2)
       WHERE character_id = $1
       RETURNING dusts, dust_level`;
