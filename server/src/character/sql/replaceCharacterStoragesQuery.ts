export const replaceCharacterStoragesQuery = `
  WITH deleted AS (
    DELETE FROM character_storages
    WHERE character_id = $1
  )
  INSERT INTO character_storages (
    character_id,
    storage_key,
    storage_value
  )
  SELECT
    $1,
    entry.key,
    entry.value::integer
  FROM jsonb_each_text($2::jsonb) AS entry
`;
