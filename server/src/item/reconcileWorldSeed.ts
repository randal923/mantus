import type { PoolClient } from "pg";

export interface WorldSeedReconciliationParams {
  readonly mapName: string;
  /** The current map version = sha256(mapSha256:itemsSha256). */
  readonly mapVersion: string;
  /** Every seed key the current items.bin + content.json can produce. */
  readonly validSeedKeys: ReadonlySet<string>;
}

export interface WorldSeedReconciliationResult {
  readonly staleRows: number;
  readonly deleted: number;
}

interface StaleRow {
  id: string;
  item_type_id: number;
  count: number;
  seed_key: string | null;
  seed_map_version: string | null;
  location_type: string;
  child_count: number;
}

/**
 * Reconcile persisted world-item delta rows left behind by a map re-import.
 *
 * When the converter re-runs, `seed_map_version` changes and any row still
 * carrying the old version makes the server refuse to boot
 * ("persisted world items require reconciliation"). The `items_immutable_identity`
 * trigger forbids rewriting a row's seed origin, so the only safe fix is to
 * DELETE the stale row — the item then reverts to its fresh seeded state via the
 * memory-first materializer, which is not a dupe.
 *
 * A stale row is only classifiable (safe to delete) when ALL of:
 * - its `seed_key` still exists in the new items.bin (the seed fixture is still
 *   there, so reverting to seed is meaningful),
 * - it is still world/house-located in place (deleting a seed item a player has
 *   picked up would be theft), and
 * - it has no materialized child items (a modified container needs manual
 *   review, not blind deletion).
 *
 * Anything else is unclassifiable and aborts the whole transaction (the caller
 * must ROLLBACK) — charter rule 12: never hand-destroy data without reconciling.
 * Every deletion writes an `item-destroyed` audit row in the same transaction
 * (charter rule 11). Runs offline only, never from the game tick.
 *
 * The caller owns BEGIN/COMMIT; this function only reads/writes within it.
 */
export async function reconcileWorldSeed(
  client: PoolClient,
  { mapName, mapVersion, validSeedKeys }: WorldSeedReconciliationParams,
): Promise<WorldSeedReconciliationResult> {
  const stale = await client.query<StaleRow>(
    `SELECT i.id, i.item_type_id, i.count, i.seed_key,
            i.seed_map_version, i.location_type,
            (SELECT count(*) FROM items c WHERE c.container_id = i.id)::int
              AS child_count
       FROM items i
       WHERE i.seed_map_name = $1 AND i.seed_map_version <> $2
       ORDER BY i.id
       FOR UPDATE`,
    [mapName, mapVersion],
  );
  if (stale.rows.length === 0) {
    return { staleRows: 0, deleted: 0 };
  }

  const unclassifiable = stale.rows.filter(
    (row) =>
      !row.seed_key ||
      !validSeedKeys.has(row.seed_key) ||
      (row.location_type !== "world" && row.location_type !== "house") ||
      row.child_count > 0,
  );
  if (unclassifiable.length > 0) {
    const sample = unclassifiable
      .slice(0, 5)
      .map((row) => `${row.seed_key ?? "<no-seed-key>"} (${row.location_type})`)
      .join(", ");
    throw new Error(
      `world-seed reconciliation aborted: ${unclassifiable.length} unclassifiable ` +
        `stale row(s) require manual review: ${sample}`,
    );
  }

  for (const row of stale.rows) {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES ('item-destroyed', null, $1,
         jsonb_build_object(
           'itemTypeId', $2::integer,
           'count', $3::integer,
           'reason', 'world-seed-reconciliation',
           'seedKey', $4::text,
           'staleSeedMapVersion', $5::text,
           'seedMapVersion', $6::text
         ))`,
      [
        row.id,
        row.item_type_id,
        row.count,
        row.seed_key,
        row.seed_map_version,
        mapVersion,
      ],
    );
    await client.query("DELETE FROM items WHERE id = $1", [row.id]);
  }

  return { staleRows: stale.rows.length, deleted: stale.rows.length };
}
