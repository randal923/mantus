export const insertProgressionEventsQuery = `
  INSERT INTO progression_events (
    character_id,
    event_id,
    event_type
  )
  SELECT
    $1,
    incoming.event_id,
    incoming.event_type
  FROM unnest(
    $2::text[],
    $3::text[]
  ) AS incoming(event_id, event_type)
  ON CONFLICT DO NOTHING
  RETURNING event_id
`;
