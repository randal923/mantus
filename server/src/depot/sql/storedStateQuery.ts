/**
 * Loads a character's entire stored state (depot + inbox item subtrees, stash
 * counts, revision counters) in one statement so the snapshot is consistent.
 */
export const storedStateQuery = `WITH RECURSIVE stored AS (
    SELECT i.*, 1 AS item_depth
    FROM items i
    WHERE i.character_id = $1 AND i.location_type IN ('depot', 'inbox')
    UNION ALL
    SELECT child.*, stored.item_depth + 1
    FROM items child
    JOIN stored ON child.container_id = stored.id
    WHERE child.location_type IN ('container', 'corpse')
      AND stored.item_depth < 8
  )
  SELECT
    (SELECT coalesce(json_agg(json_build_object(
        'id', s.id, 'item_type_id', s.item_type_id, 'count', s.count,
        'attributes', s.attributes, 'version', s.version,
        'location_type', s.location_type, 'character_id', s.character_id,
        'container_id', s.container_id, 'slot_index', s.slot_index,
        'depot_id', s.depot_id, 'seed_key', s.seed_key
      ) ORDER BY s.item_depth, s.id), '[]'::json)
      FROM stored s) AS items,
    (SELECT coalesce(json_agg(json_build_object(
        'depot_id', d.depot_id, 'revision', d.revision)), '[]'::json)
      FROM character_depots d WHERE d.character_id = $1) AS depot_revisions,
    (SELECT coalesce(json_agg(json_build_object(
        'item_type_id', st.item_type_id, 'count', st.count)), '[]'::json)
      FROM supply_stash st WHERE st.character_id = $1) AS stash,
    (SELECT json_build_object(
        'inbox_revision', cs.inbox_revision,
        'stash_revision', cs.stash_revision)
      FROM character_storage_state cs
      WHERE cs.character_id = $1) AS storage_state`;
