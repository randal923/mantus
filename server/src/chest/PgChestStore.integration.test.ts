import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
import { PgChestStore } from "./PgChestStore";
import type { ChestLootRequest } from "./ChestStore";

const TEST_SCHEMA = "chest_loot_integration";
const MIGRATION_LOCK_KEY = 7_281_047;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

const BACKPACK = 2_854;
const GOLD_COIN = 3_031;
const BAG = 2_853;
const KEY_RING = 2_969;

let setupClient: Client;
let pool: Pool;
let store: PgChestStore;
let characterId: string;

const request = (
  overrides: Partial<ChestLootRequest> = {},
): ChestLootRequest => ({
  uniqueId: 5_000,
  lootedKey: "chest-storage:3980",
  rewards: [
    { typeId: GOLD_COIN, count: 5, stackable: true, maxCount: 100 },
  ],
  ...overrides,
});

const goldCarried = async (): Promise<number> => {
  // Granted rows land in the backpack container chain, where character_id
  // is NULL by schema shape; the schema holds one character, so the type
  // alone identifies the carried gold.
  const rows = await pool.query<{ total: string | null }>(
    `SELECT sum(count)::text AS total FROM items WHERE item_type_id = $1`,
    [GOLD_COIN],
  );
  return Number(rows.rows[0]?.total ?? 0);
};

databaseDescribe("PgChestStore integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    setupClient = new Client({ connectionString: databaseUrl });
    await setupClient.connect();
    await setupClient.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await setupClient.query(`SET search_path TO ${TEST_SCHEMA}`);
    await applyMigrations(setupClient);
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    store = new PgChestStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_chest_loot");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ($1, 'en') RETURNING id`,
      [`chest-${randomUUID()}`],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error("account insert returned no id");
    characterId = randomUUID();
    await pool.query(
      `INSERT INTO characters (
         id, account_id, display_name, normalized_name, vocation,
         health, mana, position_x, position_y, position_z, direction,
         outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
         town_id
       ) VALUES (
         $1, $2, 'Chest Hero', 'chest hero', 'Knight',
         150, 50, 100, 100, 7, 'south', 128, 1, 1, 1, 1, 1
       )`,
      [characterId, accountId],
    );
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, character_id, equipment_slot
       ) VALUES (gen_random_uuid(), $1, 1, 'equipment', $2, 'backpack')`,
      [BACKPACK, characterId],
    );
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool.end();
    await setupClient.query("SET search_path TO public");
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("grants the reward once and audits it", async () => {
    const result = await store.loot(characterId, request());

    expect(result.status).toBe("committed");
    expect(await goldCarried()).toBe(5);
    const audits = await pool.query<{ event_type: string; details: unknown }>(
      "SELECT event_type, details FROM audit_log WHERE event_type = 'chest-loot'",
    );
    expect(audits.rowCount).toBe(1);
    expect(audits.rows[0]?.details).toMatchObject({
      chestUniqueId: 5_000,
      lootedKey: "chest-storage:3980",
    });
  });

  it("persists a key reward's ActionId on the granted row", async () => {
    const result = await store.loot(
      characterId,
      request({
        rewards: [
          {
            typeId: KEY_RING,
            count: 1,
            stackable: false,
            maxCount: 1,
            attributes: { actionId: 3_520 },
          },
        ],
      }),
    );

    expect(result.status).toBe("committed");
    const rows = await pool.query<{ attributes: unknown }>(
      "SELECT attributes FROM items WHERE item_type_id = $1",
      [KEY_RING],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.attributes).toEqual({ actionId: 3_520 });
  });

  it("refuses a replayed use, leaving exactly one grant", async () => {
    await store.loot(characterId, request());
    const replay = await store.loot(characterId, request());

    expect(replay.status).toBe("already-looted");
    expect(await goldCarried()).toBe(5);
  });

  it("gates two chests that share one looted key together", async () => {
    await store.loot(characterId, request({ uniqueId: 5_006 }));
    const paired = await store.loot(characterId, request({ uniqueId: 5_007 }));

    expect(paired.status).toBe("already-looted");
    expect(await goldCarried()).toBe(5);
  });

  it("keeps a repeatable chest closed until its cooldown expires", async () => {
    const repeatable = request({ cooldownSeconds: 3_600 });
    expect((await store.loot(characterId, repeatable)).status).toBe("committed");
    expect((await store.loot(characterId, repeatable)).status).toBe(
      "already-looted",
    );

    // Rewind the stored deadline the way an elapsed cooldown would.
    await pool.query(
      "UPDATE character_chest_loot SET available_at = now() - interval '1 second'",
    );
    expect((await store.loot(characterId, repeatable)).status).toBe("committed");
    expect(await goldCarried()).toBe(10);
  });

  it("racing uses of one chest leave exactly one grant", async () => {
    const [first, second] = await Promise.all([
      store.loot(characterId, request()),
      store.loot(characterId, request()),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["already-looted", "committed"]);
    expect(await goldCarried()).toBe(5);
  });

  it("puts a bagged reward inside the granted container", async () => {
    const result = await store.loot(
      characterId,
      request({
        rewards: [
          { typeId: KEY_RING, count: 1, stackable: false, maxCount: 1 },
        ],
        container: { typeId: BAG, capacity: 8 },
      }),
    );

    expect(result.status).toBe("committed");
    // The bag lands in the backpack chain (container row, character_id NULL).
    const bag = await pool.query<{ id: string }>(
      "SELECT id FROM items WHERE item_type_id = $1",
      [BAG],
    );
    expect(bag.rowCount).toBe(1);
    const inside = await pool.query<{ item_type_id: number }>(
      "SELECT item_type_id FROM items WHERE container_id = $1",
      [bag.rows[0]?.id],
    );
    expect(inside.rows.map((row) => row.item_type_id)).toEqual([KEY_RING]);
  });

  it("rolls back the whole grant when the reward does not fit", async () => {
    // Fill every backpack slot so the grant has nowhere to land.
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, container_id, slot_index
       )
       SELECT gen_random_uuid(), 3305, 1, 'container', bp.id, slot
       FROM (
         SELECT id FROM items
         WHERE character_id = $1 AND location_type = 'equipment'
       ) AS bp, generate_series(0, 19) AS slot`,
      [characterId],
    );
    const result = await store.loot(
      characterId,
      request({
        rewards: [
          { typeId: KEY_RING, count: 1, stackable: false, maxCount: 1 },
        ],
      }),
    );

    expect(result.status).toBe("no-space");
    const gate = await pool.query("SELECT 1 FROM character_chest_loot");
    expect(gate.rowCount).toBe(0);
  });
});
