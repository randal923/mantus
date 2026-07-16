import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set; add it to server/.env");
  process.exit(1);
}

interface SeedState {
  seeded_items: string;
  modified_seed_items: string;
  non_seed_items: string;
  completed_versions: string;
  other_audits: string;
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const result = await client.query<SeedState>(`
    SELECT
      (SELECT count(*) FROM items WHERE seed_map_name IS NOT NULL)::text
        AS seeded_items,
      (SELECT count(*) FROM items
       WHERE seed_map_name IS NOT NULL AND version > 1)::text
        AS modified_seed_items,
      (SELECT count(*) FROM items WHERE seed_map_name IS NULL)::text
        AS non_seed_items,
      (SELECT count(*) FROM world_item_seed_versions)::text
        AS completed_versions,
      (SELECT count(*) FROM audit_log
       WHERE event_type <> 'world-item-seeded')::text
        AS other_audits
  `);
  const state = result.rows[0];
  if (!state) throw new Error("could not inspect partial world seed");
  const seededItems = Number(state.seeded_items);
  if (seededItems === 0) {
    console.log("no partial world-item seed rows found");
    process.exitCode = 0;
  } else if (
    Number(state.modified_seed_items) > 0 ||
    Number(state.non_seed_items) > 0 ||
    Number(state.completed_versions) > 0 ||
    Number(state.other_audits) > 0
  ) {
    throw new Error(
      "cleanup refused: the item tables contain non-seed or modified gameplay data",
    );
  } else {
    await client.query(
      "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE",
    );
    await client.query("BEGIN");
    try {
      await client.query(
        `TRUNCATE TABLE audit_log, items, world_item_seed_versions
         RESTART IDENTITY`,
      );
      await client.query("COMMIT");
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    }
    await client.query("VACUUM (FULL, ANALYZE) items");
    await client.query("VACUUM (FULL, ANALYZE) audit_log");
    const size = await client.query<{ size: string }>(
      "SELECT pg_size_pretty(pg_database_size(current_database())) AS size",
    );
    console.log(
      `removed ${seededItems} partial world-item rows; database size is now ${
        size.rows[0]?.size ?? "unknown"
      }`,
    );
  }
} finally {
  await client.end();
}
