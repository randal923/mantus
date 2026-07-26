/** Raise the cap by one for (cap - 75) dust (Canary player.cpp:11542-11562). */
export const increaseForgeDustLimitQuery = `UPDATE character_forge_resources
       SET dusts = dusts - (dust_level - 75), dust_level = dust_level + 1
       WHERE character_id = $1
         AND dust_level < $2
         AND dusts >= dust_level - 75
       RETURNING dusts, dust_level`;
