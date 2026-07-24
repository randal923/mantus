/**
 * How many recent character snapshot versions of progression events to retain
 * in the durable table. Ids never recur, so this is a defense-in-depth window,
 * not a correctness bound; a few versions keeps the table small.
 */
export const RETAINED_PROGRESSION_SNAPSHOT_VERSIONS = 4;

export const insertProgressionEventsQuery = `
  INSERT INTO progression_events (
    character_id,
    event_id,
    event_type,
    snapshot_version
  )
  SELECT
    $1,
    incoming.event_id,
    incoming.event_type,
    $4
  FROM unnest(
    $2::text[],
    $3::text[]
  ) AS incoming(event_id, event_type)
  ON CONFLICT DO NOTHING
  RETURNING event_id
`;

/**
 * Prunes progression events older than a bounded window. Event ids are
 * globally unique and never re-delivered, so once the snapshot that reflects
 * them is durable (this runs in the same transaction) the older rows only
 * serve as belt-and-suspenders dedup; retaining a few recent snapshot versions
 * keeps the table (and the in-memory set rebuilt on load) bounded.
 */
export const pruneProgressionEventsQuery = `
  DELETE FROM progression_events
  WHERE character_id = $1 AND snapshot_version < $2
`;
