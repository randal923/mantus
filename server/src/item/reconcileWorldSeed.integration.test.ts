import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { reconcileWorldSeed } from "./reconcileWorldSeed";

const TEST_SCHEMA = "world_seed_reconcile_integration";
const MIGRATION_LOCK_KEY = 7_281_009;
const MAP_NAME = "test";
const CURRENT_VERSION = "version-current";
const OLD_VERSION = "version-old";
const DOOR_TYPE = 1209;

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;

interface SeedRow {
  seedKey: string;
  seedMapVersion: string;
  x: number;
  y: number;
  z?: number;
  stackIndex?: number;
  version?: number;
}

const insertWorldSeedRow = async (row: SeedRow): Promise<string> => {
  const id = randomUUID();
  const z = row.z ?? 7;
  const stack = row.stackIndex ?? 0;
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, version, location_type,
       world_map_name, world_x, world_y, world_z, world_stack_index,
       seed_key, seed_map_name, seed_map_version,
       seed_x, seed_y, seed_z, seed_stack_index
     ) VALUES (
       $1, $2, 1, $3, 'world',
       $4, $5, $6, $7, $8,
       $9, $4, $10, $5, $6, $7, $8
     )`,
    [
      id,
      DOOR_TYPE,
      row.version ?? 2,
      MAP_NAME,
      row.x,
      row.y,
      z,
      stack,
      row.seedKey,
      row.seedMapVersion,
    ],
  );
  return id;
};

const auditRows = async () => {
  const result = await pool.query<{ item_id: string; details: unknown }>(
    "SELECT item_id, details FROM audit_log WHERE event_type = 'item-destroyed'",
  );
  return result.rows;
};

const itemExists = async (id: string): Promise<boolean> => {
  const result = await pool.query("SELECT 1 FROM items WHERE id = $1", [id]);
  return result.rowCount === 1;
};

const runReconcile = async (validSeedKeys: Set<string>) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await reconcileWorldSeed(client, {
      mapName: MAP_NAME,
      mapVersion: CURRENT_VERSION,
      validSeedKeys,
    });
    await client.query("COMMIT");
    return result;
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  } finally {
    client.release();
  }
};

databaseDescribe("reconcileWorldSeed integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    setupClient = new Client({ connectionString: databaseUrl });
    await setupClient.connect();
    await setupClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await setupClient.query(`SET search_path TO ${TEST_SCHEMA}`);
    const migrationsDirectory = fileURLToPath(
      new URL("../../db/migrations/", import.meta.url),
    );
    for (const migration of [
      "001_accounts.sql",
      "002_account_language.sql",
      "003_characters.sql",
      "004_audit_log.sql",
      "005_items.sql",
      "006_item_identity_error.sql",
    ]) {
      await setupClient.query(
        await readFile(`${migrationsDirectory}${migration}`, "utf8"),
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient?.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient?.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient?.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
  });

  it("deletes stale in-place rows, audits them, and leaves current rows", async () => {
    const stale = await insertWorldSeedRow({
      seedKey: "test:1:1:7:0",
      seedMapVersion: OLD_VERSION,
      x: 1,
      y: 1,
    });
    const current = await insertWorldSeedRow({
      seedKey: "test:2:2:7:0",
      seedMapVersion: CURRENT_VERSION,
      x: 2,
      y: 2,
    });

    const result = await runReconcile(
      new Set(["test:1:1:7:0", "test:2:2:7:0"]),
    );

    expect(result).toEqual({ staleRows: 1, deleted: 1 });
    expect(await itemExists(stale)).toBe(false);
    expect(await itemExists(current)).toBe(true);
    const audits = await auditRows();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.item_id).toBe(stale);
    expect(audits[0]?.details).toMatchObject({
      reason: "world-seed-reconciliation",
      seedKey: "test:1:1:7:0",
      staleSeedMapVersion: OLD_VERSION,
      seedMapVersion: CURRENT_VERSION,
    });
  });

  it("aborts the whole transaction when a stale seed key no longer exists", async () => {
    const classifiable = await insertWorldSeedRow({
      seedKey: "test:1:1:7:0",
      seedMapVersion: OLD_VERSION,
      x: 1,
      y: 1,
    });
    const orphan = await insertWorldSeedRow({
      seedKey: "test:9:9:7:0",
      seedMapVersion: OLD_VERSION,
      x: 9,
      y: 9,
    });

    // Only the first key is present in the new items.bin; the orphan makes the
    // whole run fail closed.
    await expect(runReconcile(new Set(["test:1:1:7:0"]))).rejects.toThrow(
      /unclassifiable/,
    );

    // Nothing was applied — both rows survive and no audit was written.
    expect(await itemExists(classifiable)).toBe(true);
    expect(await itemExists(orphan)).toBe(true);
    expect(await auditRows()).toHaveLength(0);
  });

  it("does nothing when every seed row matches the current version", async () => {
    const current = await insertWorldSeedRow({
      seedKey: "test:1:1:7:0",
      seedMapVersion: CURRENT_VERSION,
      x: 1,
      y: 1,
    });

    const result = await runReconcile(new Set(["test:1:1:7:0"]));

    expect(result).toEqual({ staleRows: 0, deleted: 0 });
    expect(await itemExists(current)).toBe(true);
    expect(await auditRows()).toHaveLength(0);
  });
});
