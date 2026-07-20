import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { PgBestiaryStore } from "./PgBestiaryStore";

const TEST_SCHEMA = "bestiary_store_integration";
const MIGRATION_LOCK_KEY = 7_281_025;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgBestiaryStore;
let accountId: string;

const insertCharacter = async (name: string): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO characters (
       id, account_id, display_name, normalized_name, vocation,
       level, experience, magic_level, health, mana,
       position_x, position_y, position_z, direction,
       outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
       town_id
     ) VALUES (
       $1, $2, $3, $4, 'Knight',
       1, 0, 0, 150, 50,
       100, 100, 7, 'south',
       128, 1, 1, 1, 1,
       1
     )`,
    [id, accountId, name, name.toLowerCase()],
  );
  return id;
};

databaseDescribe("PgBestiaryStore integration", () => {
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
      "007_progression.sql",
      "008_diagonal_direction.sql",
      "010_monk_vocations.sql",
      "025_bestiary_kills.sql",
    ]) {
      await setupClient.query(
        await readFile(`${migrationsDirectory}${migration}`, "utf8"),
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    store = new PgBestiaryStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_bestiary_kills");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ('bestiary-integration', 'en')
       RETURNING id`,
    );
    const created = account.rows[0]?.id;
    if (!created) throw new Error("account insert returned no id");
    accountId = created;
  });

  afterAll(async () => {
    await pool?.end();
    if (setupClient) {
      await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
      await setupClient.query("SELECT pg_advisory_unlock($1)", [
        MIGRATION_LOCK_KEY,
      ]);
      await setupClient.end();
    }
  });

  it("accumulates kill deltas atomically per (character, race)", async () => {
    const characterId = await insertCharacter("Hunter");
    await store.addKills(characterId, 21, 1);
    await store.addKills(characterId, 21, 2);
    await store.addKills(characterId, 46, 1);
    const kills = await store.loadKills(characterId);
    expect(kills.get(21)).toBe(3);
    expect(kills.get(46)).toBe(1);
  });

  it("keeps counters isolated per character", async () => {
    const first = await insertCharacter("Hunter");
    const second = await insertCharacter("Rival");
    await store.addKills(first, 21, 5);
    const kills = await store.loadKills(second);
    expect(kills.size).toBe(0);
  });

  it("survives concurrent increments without losing kills", async () => {
    const characterId = await insertCharacter("Hunter");
    await Promise.all(
      Array.from({ length: 20 }, () => store.addKills(characterId, 21, 1)),
    );
    const kills = await store.loadKills(characterId);
    expect(kills.get(21)).toBe(20);
  });

  it("rejects non-positive deltas", async () => {
    const characterId = await insertCharacter("Hunter");
    await expect(store.addKills(characterId, 21, 0)).rejects.toThrow();
    await expect(store.addKills(characterId, 21, -5)).rejects.toThrow();
  });
});
