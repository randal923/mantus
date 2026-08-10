import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { applyMigrations } from "../test/applyMigrations";
import { PgCooldownStore } from "./PgCooldownStore";

const TEST_SCHEMA = "cooldown_store_integration";
const MIGRATION_LOCK_KEY = 7_281_005;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgCooldownStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`cooldown-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Chiller ${label}`,
    vocation: "Knight",
    sex: "male",
  });
  const summary = (await characterStore.listByAccountId(accountId))[0];
  if (!summary) throw new Error("character was not created");
  return summary.id;
};

databaseDescribe("PgCooldownStore integration", () => {
  let characterId: string;

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
    characterStore = new PgCharacterStore(pool);
    characterService = new CharacterService(characterStore, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    });
    store = new PgCooldownStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_spell_cooldowns");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    characterId = await createCharacter("alpha");
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("round-trips a replace through load", async () => {
    const readyAt = Date.now() + 3_600_000;
    await store.replace(characterId, [
      { key: "spell:uteta-res-eq", readyAt, totalMs: 7_200_000 },
      { key: "group:support", readyAt: readyAt - 3_599_000, totalMs: 2_000 },
    ]);

    const loaded = await store.load(characterId);
    expect(loaded).toHaveLength(2);
    expect(loaded).toContainEqual({
      key: "spell:uteta-res-eq",
      readyAt,
      totalMs: 7_200_000,
    });
  });

  it("replaces the old set wholesale, empty set included", async () => {
    await store.replace(characterId, [
      { key: "spell:exura", readyAt: Date.now() + 5_000, totalMs: 1_000 },
    ]);
    await store.replace(characterId, [
      { key: "spell:exori", readyAt: Date.now() + 8_000, totalMs: 2_000 },
    ]);
    expect(await store.load(characterId)).toHaveLength(1);
    expect((await store.load(characterId))[0]?.key).toBe("spell:exori");

    await store.replace(characterId, []);
    expect(await store.load(characterId)).toEqual([]);
  });

  it("replaces rows whose keys survive into the new set", async () => {
    const readyAt = Date.now() + 30_000;
    await store.replace(characterId, [
      { key: "spell:exevo-gran-mas-vis", readyAt, totalMs: 36_000 },
      { key: "group:focus", readyAt, totalMs: 36_000 },
    ]);
    await store.replace(characterId, [
      { key: "spell:exevo-gran-mas-vis", readyAt: readyAt + 60_000, totalMs: 36_000 },
      { key: "group:attack", readyAt: readyAt + 60_000, totalMs: 4_000 },
    ]);

    const loaded = await store.load(characterId);
    expect(loaded).toHaveLength(2);
    expect(loaded).toContainEqual({
      key: "spell:exevo-gran-mas-vis",
      readyAt: readyAt + 60_000,
      totalMs: 36_000,
    });
    expect(loaded).toContainEqual({
      key: "group:attack",
      readyAt: readyAt + 60_000,
      totalMs: 4_000,
    });
  });

  it("scopes rows to their character", async () => {
    const other = await createCharacter("beta");
    await store.replace(characterId, [
      { key: "spell:exura", readyAt: Date.now() + 5_000, totalMs: 1_000 },
    ]);

    expect(await store.load(other)).toEqual([]);
  });
});
