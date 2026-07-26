export const selectBoostedDayQuery = `SELECT day::text, creature_race_id, creature_name, boss_race_id, boss_name
       FROM boosted_daily
       WHERE day = $1::date`;
