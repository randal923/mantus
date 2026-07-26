export const insertBoostedDayQuery = `INSERT INTO boosted_daily (
         day, creature_race_id, creature_name, boss_race_id, boss_name
       ) VALUES ($1::date, $2, $3, $4, $5)
       ON CONFLICT (day) DO NOTHING`;
