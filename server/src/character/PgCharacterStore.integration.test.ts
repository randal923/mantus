import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
  vocation: character.vocation,
  progressionDefinitionVersion: character.progressionDefinitionVersion,
  level: character.level,
  experience: character.experience,
  magicLevel: character.magicLevel,
  manaSpent: character.manaSpent,
  health: character.health,
  mana: character.mana,
  soul: character.soul,
  skills: character.skills,
  progressionEvents: [],
  positionX,
  positionY: character.positionY,
  positionZ: character.positionZ,
  direction: character.direction,
  outfit: character.outfit,
  skull: character.skull,
  skullExpiresAt: character.skullExpiresAt,
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
      "006_item_identity_error.sql",
      "007_progression.sql",
      "008_diagonal_direction.sql",
      "009_item_interactions.sql",
      "010_monk_vocations.sql",
      "011_npc_travel.sql",
      "014_character_storages.sql",
      "015_depot_and_inbox.sql",
      "018_pvp.sql",
      "023_character_action_bar.sql",
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

  it("loads server-owned quest storage values used by NPC availability", async () => {
    const accountId = await createAccount("npc-storage");
    await service.create(accountId, {
      displayName: "Quest Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const summary = (await store.listByAccountId(accountId))[0];
    if (!summary) throw new Error("character was not created");
    await pool.query(
      `INSERT INTO character_storages (
         character_id, storage_key, storage_value
       ) VALUES ($1, $2, $3)`,
      [summary.id, "Storage.Quest.Example", 4],
    );

    const character = await store.findByIdForAccount(accountId, summary.id);

    expect(character?.storageValues).toEqual({
      "Storage.Quest.Example": 4,
    });
  });

  it("persists the action bar and starts new characters with an empty one", async () => {
    const accountId = await createAccount("action-bar");
    await service.create(accountId, {
      displayName: "Bar Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const summary = (await store.listByAccountId(accountId))[0];
    if (!summary) throw new Error("character was not created");
    const created = await store.findByIdForAccount(accountId, summary.id);
    expect(created?.actionBar).toEqual([]);

    const actionBar = ["exori", null, "exura ico"];
    await store.updateActionBar(summary.id, actionBar);
    const updated = await store.findByIdForAccount(accountId, summary.id);
    expect(updated?.actionBar).toEqual(actionBar);
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

    const newer = saveSnapshot(character, 101);
    const newerSkills = newer.skills.map((skill) =>
      skill.skill === "sword" ? { ...skill, tries: 1 } : skill,
    );
    await expect(
      store.saveSnapshot({ ...newer, skills: newerSkills }),
    ).resolves.toBe(2);
    const stale = saveSnapshot(character, 102);
    await expect(
      store.saveSnapshot({
        ...stale,
        skills: stale.skills.map((skill) =>
          skill.skill === "sword" ? { ...skill, tries: 2 } : skill,
        ),
      }),
    ).rejects.toMatchObject({
      code: "version-conflict",
    });

    const persisted = await store.findByIdForAccount(accountId, character.id);
    expect(persisted).toMatchObject({ positionX: 101, version: 2 });
    expect(
      persisted?.skills.find((skill) => skill.skill === "sword"),
    ).toMatchObject({ tries: 1 });
  });

  it("rejects a duplicate progression event without changing the snapshot", async () => {
    const accountId = await createAccount("progression-event");
    await service.create(accountId, {
      displayName: "Replay Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const summary = (await store.listByAccountId(accountId))[0];
    if (!summary) throw new Error("character was not created");
    const character = await store.findByIdForAccount(accountId, summary.id);
    if (!character) throw new Error("character was not found");
    const event = { id: "kill:rat:durable", type: "experience" } as const;

    await expect(
      store.saveSnapshot({
        ...saveSnapshot(character, 101),
        progressionEvents: [event],
      }),
    ).resolves.toBe(2);
    const reloaded = await store.findByIdForAccount(accountId, character.id);
    if (!reloaded) throw new Error("character was not reloaded");
    expect(reloaded.progressionEventIds).toContain(event.id);

    await expect(
      store.saveSnapshot({
        ...saveSnapshot(reloaded, 102),
        progressionEvents: [event],
      }),
    ).rejects.toMatchObject({ code: "version-conflict" });

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
    const summary = characters[0];
    if (!summary) throw new Error("character was not created");
    const character = await store.findByIdForAccount(accountId, summary.id);
    if (!character) throw new Error("created character could not be loaded");

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
      expect.arrayContaining([2854, 3066, 3035, 266]),
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

  it("serializes generic container moves and keeps one durable owner", async () => {
    const accountId = await createAccount("container-move");
    const characters = await service.create(accountId, {
      displayName: "Container Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const character = characters[0];
    if (!character) throw new Error("character was not created");
    const backpack = await pool.query<{ id: string }>(
      `SELECT id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'`,
      [character.id],
    );
    const backpackId = backpack.rows[0]?.id;
    if (!backpackId) throw new Error("starter backpack was not created");
    const bagId = randomUUID();
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, container_id, slot_index
       ) VALUES ($1, 2853, 'container', $2, 10)`,
      [bagId, backpackId],
    );
    // Starter loadouts no longer include gold; seed the stack the moves need.
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, container_id, slot_index
       ) VALUES ($1, 3031, 100, 'container', $2, 11)`,
      [randomUUID(), backpackId],
    );
    const source = await pool.query<{ id: string; version: number }>(
      `SELECT id, version FROM items
       WHERE container_id = $1 AND item_type_id = 3031`,
      [backpackId],
    );
    const item = source.rows[0];
    if (!item) throw new Error("starter gold was not created");

    const results = await Promise.allSettled([
      itemStore.moveToContainer(
        character.id,
        item.id,
        item.version,
        bagId,
        1,
        0,
      ),
      itemStore.moveToContainer(
        character.id,
        item.id,
        item.version,
        bagId,
        1,
        0,
      ),
    ]);
    const persisted = await pool.query<{
      container_id: string | null;
      count: number;
    }>(
      `SELECT container_id, count FROM items WHERE id = $1`,
      [item.id],
    );
    const audits = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM audit_log
       WHERE item_id = $1 AND event_type = 'item-transferred'`,
      [item.id],
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(persisted.rows).toEqual([
      { container_id: bagId, count: 100 },
    ]);
    expect(Number(audits.rows[0]?.count)).toBe(1);
  });

  it("swaps occupied container slots and audit entries in one transaction", async () => {
    const accountId = await createAccount("container-swap");
    const characters = await service.create(accountId, {
      displayName: "Swap Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const character = characters[0];
    if (!character) throw new Error("character was not created");
    const backpack = await pool.query<{ id: string; version: number }>(
      `SELECT id, version FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'`,
      [character.id],
    );
    const container = backpack.rows[0];
    if (!container) throw new Error("starter backpack was not created");
    const sourceId = randomUUID();
    const displacedId = randomUUID();
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, container_id, slot_index
       ) VALUES
         ($1, 3273, 'container', $3, 18),
         ($2, 3274, 'container', $3, 19)`,
      [sourceId, displacedId, container.id],
    );

    await itemStore.moveToContainer(
      character.id,
      sourceId,
      1,
      container.id,
      container.version,
      19,
    );

    const persisted = await pool.query<{
      id: string;
      slot_index: number;
      version: number;
    }>(
      `SELECT id, slot_index, version FROM items
       WHERE id = ANY($1::uuid[])
       ORDER BY id`,
      [[sourceId, displacedId]],
    );
    expect(persisted.rows).toEqual(
      [
        { id: sourceId, slot_index: 19, version: 2 },
        { id: displacedId, slot_index: 18, version: 2 },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
    const audits = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_log
       WHERE item_id = ANY($1::uuid[]) AND event_type = 'item-transferred'`,
      [[sourceId, displacedId]],
    );
    expect(Number(audits.rows[0]?.count)).toBe(2);
  });

  it("rejects over-capacity pickup, container cycles, and excessive nesting", async () => {
    const accountId = await createAccount("container-validation");
    const characters = await service.create(accountId, {
      displayName: "Nested Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const character = characters[0];
    if (!character) throw new Error("character was not created");
    const overweightSource = {
      seedKey: "test:102:200:7:0",
      mapName: "test",
      mapVersion: "test-version",
      typeId: 21100,
      attributes: {},
      position: { x: 102, y: 200, z: 7 },
      stackIndex: 0,
      contents: [],
    } as const;
    await expect(
      itemStore.pickup(
        character.id,
        overweightSource.seedKey,
        1,
        overweightSource.position,
        overweightSource,
      ),
    ).rejects.toThrow("capacity");

    const rootId = randomUUID();
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, character_id, slot_index
       ) VALUES ($1, 2853, 'inventory', $2, 0)`,
      [rootId, character.id],
    );
    const chain = [rootId];
    for (let depth = 1; depth < 8; depth++) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO items (
           id, item_type_id, location_type, container_id, slot_index
         ) VALUES ($1, 2853, 'container', $2, 0)`,
        [id, chain.at(-1)],
      );
      chain.push(id);
    }
    const deepestId = chain.at(-1);
    if (!deepestId) throw new Error("nested chain was not created");
    await expect(
      itemStore.moveToContainer(
        character.id,
        rootId,
        1,
        deepestId,
        1,
        0,
      ),
    ).rejects.toThrow("cycle");

    const subtreeId = randomUUID();
    const childId = randomUUID();
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, character_id, slot_index
       ) VALUES ($1, 2853, 'inventory', $2, 1)`,
      [subtreeId, character.id],
    );
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, container_id, slot_index
       ) VALUES ($1, 2853, 'container', $2, 0)`,
      [childId, subtreeId],
    );
    await expect(
      itemStore.moveToContainer(
        character.id,
        subtreeId,
        1,
        deepestId,
        1,
        1,
      ),
    ).rejects.toThrow("nesting");
  });

  it("rolls ownership and audit back together when persistence fails", async () => {
    const accountId = await createAccount("container-rollback");
    const characters = await service.create(accountId, {
      displayName: "Rollback Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const character = characters[0];
    if (!character) throw new Error("character was not created");
    const backpack = await pool.query<{ id: string }>(
      `SELECT id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'`,
      [character.id],
    );
    const backpackId = backpack.rows[0]?.id;
    if (!backpackId) throw new Error("starter backpack was not created");
    const bagId = randomUUID();
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, container_id, slot_index
       ) VALUES ($1, 2853, 'container', $2, 10)`,
      [bagId, backpackId],
    );
    // Starter loadouts no longer include gold; seed the stack the moves need.
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, container_id, slot_index
       ) VALUES ($1, 3031, 100, 'container', $2, 11)`,
      [randomUUID(), backpackId],
    );
    const source = await pool.query<{
      id: string;
      version: number;
      container_id: string;
    }>(
      `SELECT id, version, container_id FROM items
       WHERE container_id = $1 AND item_type_id = 3031`,
      [backpackId],
    );
    const item = source.rows[0];
    if (!item) throw new Error("starter gold was not created");
    await pool.query(`
      CREATE FUNCTION fail_item_transfer_audit()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.event_type = 'item-transferred' THEN
          RAISE EXCEPTION 'injected audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_item_transfer_audit
      BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION fail_item_transfer_audit();
    `);
    try {
      await expect(
        itemStore.moveToContainer(
          character.id,
          item.id,
          item.version,
          bagId,
          1,
          0,
        ),
      ).rejects.toThrow("injected audit failure");
    } finally {
      await pool.query("DROP TRIGGER fail_item_transfer_audit ON audit_log");
      await pool.query("DROP FUNCTION fail_item_transfer_audit()");
    }
    const persisted = await pool.query<{
      container_id: string;
      version: number;
    }>(
      `SELECT container_id, version FROM items WHERE id = $1`,
      [item.id],
    );
    const audits = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM audit_log
       WHERE item_id = $1 AND event_type = 'item-transferred'`,
      [item.id],
    );

    expect(persisted.rows).toEqual([
      { container_id: item.container_id, version: item.version },
    ]);
    expect(Number(audits.rows[0]?.count)).toBe(0);
  });

  it("commits conjuring resources, item creation, and audit atomically", async () => {
    const accountId = await createAccount("conjuring");
    const characters = await service.create(accountId, {
      displayName: "Conjuring Hero",
      vocation: "Paladin",
      lookType: 128,
    });
    const summary = characters[0];
    if (!summary) throw new Error("character was not created");
    const character = await store.findByIdForAccount(accountId, summary.id);
    if (!character) throw new Error("created character could not be loaded");

    const result = await itemStore.conjure(
      character.id,
      character.version,
      character.mana,
      character.soul,
      10,
      1,
      0,
      3447,
      10,
    );
    const persisted = await pool.query<{
      mana: number;
      soul: number;
      version: number;
    }>(
      `SELECT mana, soul, version FROM characters WHERE id = $1`,
      [character.id],
    );
    const created = await pool.query<{ count: number }>(
      `SELECT count FROM items
       WHERE item_type_id = 3447
         AND id IN (
           SELECT item_id FROM audit_log
           WHERE character_id = $1
             AND event_type = 'item-created'
             AND details->>'reason' = 'conjuring'
         )`,
      [character.id],
    );

    expect(result.characterVersion).toBe(character.version + 1);
    expect(persisted.rows).toEqual([
      {
        mana: character.mana - 10,
        soul: character.soul - 1,
        version: character.version + 1,
      },
    ]);
    expect(created.rows).toEqual([{ count: 10 }]);

    await pool.query(`
      CREATE FUNCTION fail_conjuring_audit()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.event_type = 'item-created'
           AND NEW.details->>'reason' = 'conjuring' THEN
          RAISE EXCEPTION 'injected conjuring audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_conjuring_audit
      BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION fail_conjuring_audit();
    `);
    try {
      await expect(
        itemStore.conjure(
          character.id,
          character.version + 1,
          character.mana - 10,
          character.soul - 1,
          10,
          1,
          0,
          3447,
          10,
        ),
      ).rejects.toThrow("injected conjuring audit failure");
    } finally {
      await pool.query("DROP TRIGGER fail_conjuring_audit ON audit_log");
      await pool.query("DROP FUNCTION fail_conjuring_audit()");
    }
    const afterFailure = await pool.query<{
      mana: number;
      soul: number;
      version: number;
    }>(
      `SELECT mana, soul, version FROM characters WHERE id = $1`,
      [character.id],
    );
    expect(afterFailure.rows).toEqual(persisted.rows);
  });
});
