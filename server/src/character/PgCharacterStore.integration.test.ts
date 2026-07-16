import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import type { Character, CharacterSaveSnapshot } from "./Character";
import { CharacterService } from "./CharacterService";
import { PgCharacterStore } from "./PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgItemStore } from "../item/PgItemStore";

const TEST_SCHEMA = "character_store_integration";
const MIGRATION_LOCK_KEY = 7_281_002;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgCharacterStore;
let service: CharacterService;
let itemStore: PgItemStore;

const createAccount = async (label: string): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`integration-${label}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("account insert returned no id");
  return id;
};

const saveSnapshot = (
  character: Character,
  positionX: number,
): CharacterSaveSnapshot => ({
  characterId: character.id,
  expectedVersion: character.version,
  level: character.level,
  experience: character.experience,
  health: character.health,
  maxHealth: character.maxHealth,
  mana: character.mana,
  maxMana: character.maxMana,
  capacity: character.capacity,
  positionX,
  positionY: character.positionY,
  positionZ: character.positionZ,
  direction: character.direction,
  outfit: character.outfit,
});

databaseDescribe("PgCharacterStore integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    setupClient = new Client({ connectionString: databaseUrl });
    await setupClient.connect();
    await setupClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await setupClient.query(
      "DROP SCHEMA IF EXISTS character_store_integration CASCADE",
    );
    await setupClient.query("CREATE SCHEMA character_store_integration");
    await setupClient.query("SET search_path TO character_store_integration");
    const migrationsDirectory = fileURLToPath(
      new URL("../../db/migrations/", import.meta.url),
    );
    for (const migration of [
      "001_accounts.sql",
      "002_account_language.sql",
      "003_characters.sql",
      "004_audit_log.sql",
      "005_items.sql",
    ]) {
      await setupClient.query(
        await readFile(`${migrationsDirectory}${migration}`, "utf8"),
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    store = new PgCharacterStore(pool);
    service = new CharacterService(store, { x: 100, y: 200, z: 7, townId: 1 });
    itemStore = new PgItemStore(pool, await loadItemCatalog(), "test");
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM accounts");
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool.end();
    await setupClient.query("SET search_path TO public");
    await setupClient.query(
      "DROP SCHEMA IF EXISTS character_store_integration CASCADE",
    );
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("allows only one concurrent claim for a normalized name", async () => {
    const [accountA, accountB] = await Promise.all([
      createAccount("name-a"),
      createAccount("name-b"),
    ]);

    const results = await Promise.allSettled([
      service.create(accountA, {
        displayName: "Alice",
        vocation: "Knight",
        lookType: 128,
      }),
      service.create(accountB, {
        displayName: "  ALICE  ",
        vocation: "Druid",
        lookType: 136,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status !== "rejected") throw new Error("expected one rejection");
    expect(rejected.reason).toMatchObject({ code: "name-taken" });
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM characters WHERE normalized_name = 'alice'",
    );
    expect(Number(count.rows[0]?.count)).toBe(1);
  });

  it("keeps concurrent character creation within the account limit", async () => {
    const accountId = await createAccount("limit");
    for (const name of ["Alicia", "Bianca", "Celina", "Daria"]) {
      await service.create(accountId, {
        displayName: name,
        vocation: "Knight",
        lookType: 128,
      });
    }

    const results = await Promise.allSettled([
      service.create(accountId, {
        displayName: "Elena",
        vocation: "Knight",
        lookType: 128,
      }),
      service.create(accountId, {
        displayName: "Fiona",
        vocation: "Knight",
        lookType: 128,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status !== "rejected") throw new Error("expected one rejection");
    expect(rejected.reason).toMatchObject({ code: "limit-reached" });
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM characters WHERE account_id = $1",
      [accountId],
    );
    expect(Number(count.rows[0]?.count)).toBe(5);
  });

  it("rejects a stale snapshot without overwriting the newer save", async () => {
    const accountId = await createAccount("version");
    await service.create(accountId, {
      displayName: "Version Hero",
      vocation: "Paladin",
      lookType: 128,
    });
    const summary = (await store.listByAccountId(accountId))[0];
    if (!summary) throw new Error("character was not created");
    const character = await store.findByIdForAccount(accountId, summary.id);
    if (!character) throw new Error("character was not found");

    await expect(store.saveSnapshot(saveSnapshot(character, 101))).resolves.toBe(2);
    await expect(store.saveSnapshot(saveSnapshot(character, 102))).rejects.toMatchObject({
      code: "version-conflict",
    });

    const persisted = await store.findByIdForAccount(accountId, character.id);
    expect(persisted).toMatchObject({ positionX: 101, version: 2 });
  });

  it("creates starter items and their audit records in the character transaction", async () => {
    const accountId = await createAccount("starter-set");
    const characters = await service.create(accountId, {
      displayName: "Starter Hero",
      vocation: "Druid",
      lookType: 136,
    });
    const character = characters[0];
    if (!character) throw new Error("character was not created");

    const items = await pool.query<{ item_type_id: number; location_type: string }>(
      `WITH RECURSIVE owned AS (
         SELECT id, item_type_id, location_type
         FROM items
         WHERE character_id = $1
         UNION ALL
         SELECT child.id, child.item_type_id, child.location_type
         FROM items child
         JOIN owned parent ON child.container_id = parent.id
       )
       SELECT item_type_id, location_type FROM owned`,
      [character.id],
    );
    const audits = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM audit_log
       WHERE character_id = $1 AND event_type = 'item-created'`,
      [character.id],
    );

    expect(items.rows.map((item) => item.item_type_id)).toEqual(
      expect.arrayContaining([2854, 3066, 3031, 266]),
    );
    expect(Number(audits.rows[0]?.count)).toBe(items.rowCount);
  });

  it("allows one winner when two characters pick up the same world item", async () => {
    const [accountA, accountB] = await Promise.all([
      createAccount("loot-a"),
      createAccount("loot-b"),
    ]);
    const [charactersA, charactersB] = await Promise.all([
      service.create(accountA, {
        displayName: "Loot Alice",
        vocation: "Knight",
        lookType: 128,
      }),
      service.create(accountB, {
        displayName: "Loot Bianca",
        vocation: "Paladin",
        lookType: 136,
      }),
    ]);
    const characterA = charactersA[0];
    const characterB = charactersB[0];
    if (!characterA || !characterB) throw new Error("characters were not created");
    const position = { x: 101, y: 200, z: 7 };
    const seedKey = "test:101:200:7:0";
    const source = {
      seedKey,
      mapName: "test",
      mapVersion: "test-version",
      typeId: 3031,
      attributes: { count: 1 },
      position,
      stackIndex: 0,
      contents: [],
    } as const;

    const results = await Promise.allSettled([
      itemStore.pickup(characterA.id, seedKey, 1, position, source),
      itemStore.pickup(characterB.id, seedKey, 1, position, source),
    ]);
    const inventories = await Promise.all([
      itemStore.loadForCharacter(characterA.id),
      itemStore.loadForCharacter(characterB.id),
    ]);
    const persisted = await pool.query<{ id: string }>(
      "SELECT id FROM items WHERE seed_key = $1",
      [seedKey],
    );
    const itemId = persisted.rows[0]?.id;
    if (!itemId) throw new Error("world item was not materialized");
    const audits = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM audit_log
       WHERE item_id = $1
       ORDER BY id`,
      [itemId],
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(inventories.flat().filter((item) => item.id === itemId)).toHaveLength(1);
    expect(audits.rows.map((row) => row.event_type)).toEqual([
      "world-item-seeded",
      "item-transferred",
    ]);
    await expect(
      itemStore.pickup(characterA.id, seedKey, 1, position, source),
    ).rejects.toThrow();
    expect(
      (await Promise.all([
        itemStore.loadForCharacter(characterA.id),
        itemStore.loadForCharacter(characterB.id),
      ]))
        .flat()
        .filter((item) => item.id === itemId),
    ).toHaveLength(1);
  });
});
