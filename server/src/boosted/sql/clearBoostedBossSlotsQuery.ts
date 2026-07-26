/** Canary io_bosstiary.cpp:102-119 — a rotating boosted boss leaves slots. */
export const clearBoostedBossSlotsQuery = `UPDATE character_boss_slots
       SET slot_one_race_id = CASE WHEN slot_one_race_id = $1 THEN NULL ELSE slot_one_race_id END,
           slot_two_race_id = CASE WHEN slot_two_race_id = $1 THEN NULL ELSE slot_two_race_id END
       WHERE slot_one_race_id = $1 OR slot_two_race_id = $1`;
