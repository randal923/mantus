import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { applyMigrations } from "../test/applyMigrations";
import { loadItemCatalog } from "./loadItemCatalog";

const TEST_SCHEMA = "item_crash_harness";
const MIGRATION_LOCK_KEY = 7_281_009;
const BACKPACK_TYPE = 2854;
const GOLD_TYPE = 3031;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let characterService: CharacterService;
let characterId: string;
let backpackId: string;
let pouchId: string;

const workerPath = fileURLToPath(
  new URL("./crashHarness/crashWorker.ts", import.meta.url),
);
const tsxBin = fileURLToPath(
  new URL("../../node_modules/.bin/tsx", import.meta.url),
);

const insertItem = async (
  typeId: number,
  containerId: string,
  slot: number,
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (id, item_type_id, count, location_type, container_id, slot_index)
     VALUES ($1, $2, 1, 'container', $3, $4)`,
    [id, typeId, containerId, slot],
  );
  return id;
};

const insertBackpackEquipment = async (typeId: number): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (id, item_type_id, count, location_type, character_id, equipment_slot)
     VALUES ($1, $2, 1, 'equipment', $3, 'backpack')`,
    [id, typeId, characterId],
  );
  return id;
};

const itemLocation = async (id: string) => {
  const { rows } = await pool.query<{
    container_id: string | null;
    slot_index: number | null;
    version: number;
  }>(
    `SELECT container_id, slot_index, version FROM items WHERE id = $1`,
    [id],
  );
  return rows;
};

const runWorker = (
  itemId: string,
  crashPoint: "before-commit" | "after-commit" | null,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> =>
  new Promise((resolve, reject) => {
    const child = spawn(tsxBin, [workerPath], {
      env: {
        ...process.env,
        ITEM_TX_DATABASE_URL: databaseUrl,
        ITEM_TX_SCHEMA: TEST_SCHEMA,
        ITEM_TX_CHARACTER_ID: characterId,
        ITEM_TX_ITEM_ID: itemId,
        ITEM_TX_DEST_CONTAINER_ID: pouchId,
        ITEM_TX_DEST_SLOT: "1",
        ITEM_TX_CRASH_POINT: crashPoint ?? "",
      },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });

databaseDescribe("PgItemStore process-kill crash durability", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    setupClient = new Client({ connectionString: databaseUrl });
    await setupClient.connect();
    await setupClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await setupClient.query(`SET search_path TO ${TEST_SCHEMA}`);
    await applyMigrations(setupClient);
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    characterService = new CharacterService(new PgCharacterStore(pool), {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    });
    // The worker's PgItemStore loads the catalog; warm it here to fail fast.
    await loadItemCatalog();
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient?.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient?.end();
  });

  beforeEach(async () => {
    // TRUNCATE clears deeply-nested starter containers in one shot, past the
    // self-referential RESTRICT FK that a plain DELETE would trip on.
    await pool.query("TRUNCATE items CASCADE");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const accountId = randomUUID();
    await pool.query(
      `INSERT INTO accounts (id, supabase_user_id) VALUES ($1, $2)`,
      [accountId, `crash-${accountId}`],
    );
    const [character] = await characterService.create(accountId, {
      displayName: "Crasher",
      vocation: "Knight",
      lookType: 128,
    });
    if (!character) throw new Error("character was not created");
    characterId = character.id;
    // Drop the starter gear so only our two containers + the moved item exist.
    await pool.query("TRUNCATE items CASCADE");
    backpackId = await insertBackpackEquipment(BACKPACK_TYPE);
    pouchId = await insertItem(BACKPACK_TYPE, backpackId, 0);
  });

  it("leaves the item in its original location when killed before commit", async () => {
    const itemId = await insertItem(GOLD_TYPE, backpackId, 1);

    // Abrupt death before COMMIT: the DB socket is severed with the transaction
    // still open, so Postgres aborts it (exit 137 marks the injected crash).
    const { code } = await runWorker(itemId, "before-commit");
    expect(code).toBe(137);

    // Uncommitted: exactly one row, still in the backpack at slot 1, v1.
    const rows = await itemLocation(itemId);
    expect(rows).toEqual([
      { container_id: backpackId, slot_index: 1, version: 1 },
    ]);
  });

  it("leaves the item only in its new location when killed after commit", async () => {
    const itemId = await insertItem(GOLD_TYPE, backpackId, 1);

    // Abrupt death immediately after COMMIT: the write is already durable.
    const { code } = await runWorker(itemId, "after-commit");
    expect(code).toBe(137);

    // Committed: exactly one row, now in the pouch at slot 1, v2 — no duplicate.
    const rows = await itemLocation(itemId);
    expect(rows).toEqual([
      { container_id: pouchId, slot_index: 1, version: 2 },
    ]);
  });

  it("commits normally with no injected crash", async () => {
    const itemId = await insertItem(GOLD_TYPE, backpackId, 1);

    const { code, signal } = await runWorker(itemId, null);
    expect(signal).toBeNull();
    expect(code).toBe(0);

    const rows = await itemLocation(itemId);
    expect(rows).toEqual([
      { container_id: pouchId, slot_index: 1, version: 2 },
    ]);
  });
});
