/**
 * Claims the character's looted gate for one chest. A one-time chest passes
 * `null` for the cooldown, so the ON CONFLICT arm never matches and a replay
 * returns no row. A repeatable chest re-claims only once its deadline has
 * passed. Either way exactly one caller can win a given gate state, which is
 * what makes the reward grant exactly-once.
 */
export const claimChestLootQuery = `
  INSERT INTO character_chest_loot (
    character_id, looted_key, chest_unique_id, available_at
  )
  VALUES (
    $1,
    $2,
    $3,
    CASE WHEN $4::integer IS NULL THEN NULL
         ELSE now() + make_interval(secs => $4::integer) END
  )
  ON CONFLICT (character_id, looted_key) DO UPDATE
    SET chest_unique_id = $3,
        looted_at = now(),
        available_at = now() + make_interval(secs => $4::integer)
    WHERE $4::integer IS NOT NULL
      AND character_chest_loot.available_at IS NOT NULL
      AND character_chest_loot.available_at <= now()
  RETURNING looted_key`;
