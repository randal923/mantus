import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import type { EquipmentSlot } from "@tibia/protocol";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { PgNpcTravelStore } from "../npc/PgNpcTravelStore";
import type { Item } from "./Item";
import { loadItemCatalog } from "./loadItemCatalog";
import { PgItemStore } from "./PgItemStore";
import { planConsume } from "./plan/planConsume";
import { planMoveToContainer } from "./plan/planMoveToContainer";
import { planPotionUse } from "./plan/planPotionUse";

const TEST_SCHEMA = "item_store_integration";
const MIGRATION_LOCK_KEY = 7_281_003;
const BACKPACK_TYPE = 2854;
const GOLD_TYPE = 3031;
const PLATINUM_TYPE = 3035;
const HELMET_TYPE = 3355;
const BOOTS_TYPE = 3552;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgItemStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;
let travelStore: PgNpcTravelStore;

type TestItemLocation =
  | { kind: "equipment"; characterId: string; slot: EquipmentSlot }
  | { kind: "container"; containerId: string; slot: number }
  | { kind: "inventory"; characterId: string; slot: number }
  | { kind: "world"; x: number; y: number; z: number; stackIndex: number };

const insertItem = async (
  typeId: number,
  count: number,
  location: TestItemLocation,
  seedKey?: string,
): Promise<string> => {
  const id = randomUUID();
  const world = location.kind === "world" ? location : null;
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type,
       character_id, container_id, slot_index, equipment_slot,
       world_map_name, world_x, world_y, world_z, world_stack_index,
       seed_key, seed_map_name, seed_map_version,
       seed_x, seed_y, seed_z, seed_stack_index
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13,
       $14, $15, $15, $16, $16, $17, $17
     )`,
    [
      id,
      typeId,
      count,
      location.kind,
      location.kind === "equipment" || location.kind === "inventory"
        ? location.characterId
        : null,
      location.kind === "container" ? location.containerId : null,
      location.kind === "container" || location.kind === "inventory"
        ? location.slot
        : null,
      location.kind === "equipment" ? location.slot : null,
      world ? "test" : null,
      world?.x ?? null,
      world?.y ?? null,
      world?.z ?? null,
      world?.stackIndex ?? null,
      seedKey ?? null,
      seedKey ? "test" : null,
      seedKey ? 100 : null,
      seedKey ? 7 : null,
    ],
  );
  return id;
};

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`item-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Mover ${label}`,
    vocation: "Knight",
    lookType: 128,
  });
  const summary = (await characterStore.listByAccountId(accountId))[0];
  if (!summary) throw new Error("character was not created");
  await pool.query(
    `WITH RECURSIVE owned AS (
       SELECT id FROM items WHERE character_id = $1
       UNION ALL
       SELECT child.id FROM items child JOIN owned ON child.container_id = owned.id
     )
     DELETE FROM items WHERE id IN (SELECT id FROM owned)`,
    [summary.id],
  );
  return summary.id;
};

const itemRow = async (id: string) => {
  const result = await pool.query<{
    location_type: string;
    container_id: string | null;
    slot_index: number | null;
    world_x: number | null;
    world_y: number | null;
    world_z: number | null;
    world_stack_index: number | null;
    count: number;
    version: number;
  }>(
    `SELECT location_type, container_id, slot_index,
       world_x, world_y, world_z, world_stack_index, count, version
     FROM items WHERE id = $1`,
    [id],
  );
  return result.rows[0];
};

const auditRows = async (eventType: string) => {
  const result = await pool.query<{ item_id: string; details: unknown }>(
    "SELECT item_id, details FROM audit_log WHERE event_type = $1",
    [eventType],
  );
  return result.rows;
};

databaseDescribe("PgItemStore.moveToContainer integration", () => {
  let characterId: string;
  let backpackId: string;
  let pouchId: string;

  /** First-touch materialization of a memory-only corpse: row inserts plus
   * loot-created audits in one persist transaction, as the plans emit it. */
  const persistCorpse = async (
    eventId: string,
    position: { x: number; y: number; z: number },
    corpseTypeId: number,
    loot: ReadonlyArray<{ typeId: number; count: number }>,
  ): Promise<{ corpse: Item; contents: Item[] }> => {
    const corpse: Item = {
      id: randomUUID(),
      typeId: corpseTypeId,
      count: 1,
      attributes: { ownerCharacterId: characterId },
      version: 1,
      location: { kind: "world", position, stackIndex: 0 },
    };
    const contents = loot.map<Item>((entry, slot) => ({
      id: randomUUID(),
      typeId: entry.typeId,
      count: entry.count,
      attributes: {},
      version: 1,
      location: { kind: "corpse", containerId: corpse.id, slot },
    }));
    const created = [corpse, ...contents];
    await store.persist({
      characterId,
      rowOps: created.map((item) => ({ kind: "insert" as const, item })),
      audits: created.map((item) => ({
        kind: "loot-created" as const,
        itemId: item.id,
        eventId,
        killerCharacterId: characterId,
        typeId: item.typeId,
        count: item.count,
      })),
    });
    return { corpse, contents };
  };

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
      "007_progression.sql",
      "008_diagonal_direction.sql",
      "009_item_interactions.sql",
      "010_monk_vocations.sql",
      "011_npc_travel.sql",
      "014_character_storages.sql",
      "015_depot_and_inbox.sql",
      "018_pvp.sql",
      "023_character_action_bar.sql",
      "029_character_potion_action_bar.sql",
    ]) {
      await setupClient.query(
        await readFile(`${migrationsDirectory}${migration}`, "utf8"),
      );
    }
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
    const catalog = await loadItemCatalog();
    store = new PgItemStore(pool, catalog, "test");
    travelStore = new PgNpcTravelStore(pool, catalog);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    characterId = await createCharacter("alpha");
    backpackId = await insertItem(BACKPACK_TYPE, 1, {
      kind: "equipment",
      characterId,
      slot: "backpack",
    });
    pouchId = await insertItem(BACKPACK_TYPE, 1, {
      kind: "container",
      containerId: backpackId,
      slot: 0,
    });
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

  it("moves an item into an empty slot and audits the transfer", async () => {
    const helmetId = await insertItem(HELMET_TYPE, 1, {
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });

    const mutation = await store.moveToContainer(
      characterId,
      helmetId,
      1,
      pouchId,
      1,
      3,
    );

    expect(mutation.before?.location).toEqual({
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });
    expect(mutation.after).toHaveLength(1);
    expect(mutation.after[0]).toMatchObject({
      id: helmetId,
      version: 2,
      location: { kind: "container", containerId: pouchId, slot: 3 },
    });
    expect(await itemRow(helmetId)).toMatchObject({
      location_type: "container",
      container_id: pouchId,
      slot_index: 3,
      version: 2,
    });
    const audits = await auditRows("item-transferred");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.details).toMatchObject({
      count: 1,
      from: { kind: "container", containerId: backpackId, slot: 2 },
      to: { kind: "container", containerId: pouchId, slot: 3 },
    });
  });

  it("merges a full stack into a matching stack and removes the source", async () => {
    const sourceId = await insertItem(GOLD_TYPE, 50, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const targetId = await insertItem(GOLD_TYPE, 30, {
      kind: "container",
      containerId: pouchId,
      slot: 0,
    });

    const mutation = await store.moveToContainer(
      characterId,
      sourceId,
      1,
      pouchId,
      1,
      0,
    );

    expect(mutation.removedItemIds).toEqual([sourceId]);
    expect(mutation.after).toHaveLength(1);
    expect(mutation.after[0]).toMatchObject({ id: targetId, count: 80 });
    expect(await itemRow(sourceId)).toBeUndefined();
    expect(await itemRow(targetId)).toMatchObject({ count: 80, version: 2 });
    const audits = await auditRows("item-merged");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.details).toMatchObject({
      sourceItemId: sourceId,
      movedCount: 50,
      sourceRemaining: 0,
      resultCount: 80,
    });
  });

  it("merges a partial count and keeps the remainder on the source", async () => {
    const sourceId = await insertItem(GOLD_TYPE, 50, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const targetId = await insertItem(GOLD_TYPE, 30, {
      kind: "container",
      containerId: pouchId,
      slot: 0,
    });

    const mutation = await store.moveToContainer(
      characterId,
      sourceId,
      1,
      pouchId,
      1,
      0,
      20,
    );

    expect(mutation.after).toHaveLength(2);
    expect(await itemRow(sourceId)).toMatchObject({ count: 30, version: 2 });
    expect(await itemRow(targetId)).toMatchObject({ count: 50, version: 2 });
    const audits = await auditRows("item-merged");
    expect(audits[0]?.details).toMatchObject({
      sourceItemId: sourceId,
      movedCount: 20,
      sourceRemaining: 30,
      resultCount: 50,
    });
  });

  it("absorbs the target when a seeded full stack merges", async () => {
    const sourceId = await insertItem(
      GOLD_TYPE,
      50,
      { kind: "container", containerId: backpackId, slot: 1 },
      `seed-${randomUUID()}`,
    );
    const targetId = await insertItem(GOLD_TYPE, 30, {
      kind: "container",
      containerId: pouchId,
      slot: 0,
    });

    const mutation = await store.moveToContainer(
      characterId,
      sourceId,
      1,
      pouchId,
      1,
      0,
    );

    expect(mutation.removedItemIds).toEqual([targetId]);
    expect(await itemRow(targetId)).toBeUndefined();
    expect(await itemRow(sourceId)).toMatchObject({
      count: 80,
      container_id: pouchId,
      slot_index: 0,
      version: 2,
    });
    expect(await auditRows("item-merged")).toHaveLength(1);
    expect(await auditRows("item-transferred")).toHaveLength(1);
  });

  it("splits a stack into an empty slot and audits the split", async () => {
    const sourceId = await insertItem(GOLD_TYPE, 50, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });

    const mutation = await store.moveToContainer(
      characterId,
      sourceId,
      1,
      pouchId,
      1,
      5,
      20,
    );

    expect(mutation.after).toHaveLength(2);
    const created = mutation.after.find((item) => item.id !== sourceId);
    expect(created).toMatchObject({
      count: 20,
      location: { kind: "container", containerId: pouchId, slot: 5 },
    });
    expect(await itemRow(sourceId)).toMatchObject({ count: 30, version: 2 });
    const audits = await auditRows("item-split");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.details).toMatchObject({
      originalCount: 50,
      remainingCount: 30,
      createdItemId: created?.id,
      createdCount: 20,
    });
  });

  it("swaps with a non-mergeable occupant", async () => {
    const helmetId = await insertItem(HELMET_TYPE, 1, {
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });
    const bootsId = await insertItem(BOOTS_TYPE, 1, {
      kind: "container",
      containerId: pouchId,
      slot: 0,
    });

    const mutation = await store.moveToContainer(
      characterId,
      helmetId,
      1,
      pouchId,
      1,
      0,
    );

    expect(mutation.after).toHaveLength(2);
    expect(await itemRow(helmetId)).toMatchObject({
      container_id: pouchId,
      slot_index: 0,
    });
    expect(await itemRow(bootsId)).toMatchObject({
      container_id: backpackId,
      slot_index: 2,
    });
  });

  it("rejects a stale item revision", async () => {
    const helmetId = await insertItem(HELMET_TYPE, 1, {
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });
    await expect(
      store.moveToContainer(characterId, helmetId, 7, pouchId, 1, 3),
    ).rejects.toThrow("stale item revision");
  });

  it("atomically restores health, consumes one potion, returns a flask, and audits replay", async () => {
    const potionId = await insertItem(266, 2, {
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });
    const character = await pool.query<{
      version: number;
      health: number;
      mana: number;
    }>(
      `UPDATE characters SET health = 10, mana = 0
       WHERE id = $1 RETURNING version, health, mana`,
      [characterId],
    );
    const current = character.rows[0];
    if (!current) throw new Error("character update returned no row");
    const planned = planPotionUse({
      characterId,
      catalog: await loadItemCatalog(),
      items: await store.loadForCharacter(characterId),
      itemId: potionId,
      expectedVersion: 1,
    });
    if (!planned) throw new Error("potion plan was rejected");
    const request = {
      actorCharacterId: characterId,
      targetCharacterId: characterId,
      itemPlan: planned.itemPlan,
      expectedTargetCharacterVersion: current.version,
      expectedTargetHealth: current.health,
      expectedTargetMana: current.mana,
      targetMaxHealth: 150,
      targetMaxMana: 55,
      healthRestore: 150,
      manaRestore: 0,
    } as const;

    const results = await Promise.allSettled([
      store.usePotion(request),
      store.usePotion(request),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const savedCharacter = await pool.query<{
      version: number;
      health: number;
      mana: number;
    }>("SELECT version, health, mana FROM characters WHERE id = $1", [
      characterId,
    ]);
    expect(savedCharacter.rows[0]).toEqual({
      version: current.version + 1,
      health: 150,
      mana: 0,
    });
    expect(await itemRow(potionId)).toMatchObject({ count: 1, version: 2 });
    const flask = await pool.query<{
      item_type_id: number;
      count: number;
    }>(
      "SELECT item_type_id, count FROM items WHERE item_type_id = 285",
    );
    expect(flask.rows).toEqual([{ item_type_id: 285, count: 1 }]);
    expect(await auditRows("item-destroyed")).toEqual([
      expect.objectContaining({
        item_id: potionId,
        details: expect.objectContaining({ count: 1, reason: "potion" }),
      }),
    ]);
    expect(await auditRows("item-created")).toContainEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          count: 1,
          reason: "potion-flask",
        }),
      }),
    );
  });

  it("rejects moving a container into itself or its own contents", async () => {
    await expect(
      store.moveToContainer(characterId, pouchId, 1, pouchId, 1, 1),
    ).rejects.toThrow("an item cannot contain itself");
    const innerId = await insertItem(BACKPACK_TYPE, 1, {
      kind: "container",
      containerId: pouchId,
      slot: 0,
    });
    await expect(
      store.moveToContainer(characterId, pouchId, 1, innerId, 1, 0),
    ).rejects.toThrow("item container cycle detected");
  });

  it("rejects a slot beyond the destination capacity", async () => {
    const helmetId = await insertItem(HELMET_TYPE, 1, {
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });
    await expect(
      store.moveToContainer(characterId, helmetId, 1, pouchId, 1, 99),
    ).rejects.toThrow("container slot is out of range");
  });

  it("persists a planned carried move atomically with its audit", async () => {
    const goldId = await insertItem(GOLD_TYPE, 40, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const carried = await store.loadForCharacter(characterId);
    const plan = planMoveToContainer({
      characterId,
      catalog: await loadItemCatalog(),
      items: carried,
      itemId: goldId,
      expectedVersion: 1,
      destinationContainerId: pouchId,
      destinationVersion: 1,
      destinationSlot: 0,
    });
    if (!plan) throw new Error("plan was rejected");

    await store.persist(plan.persist);

    expect(await itemRow(goldId)).toMatchObject({
      location_type: "container",
      container_id: pouchId,
      slot_index: 0,
      version: 2,
    });
    const audits = await auditRows("item-transferred");
    expect(audits).toContainEqual(
      expect.objectContaining({ item_id: goldId }),
    );
  });

  it("persists memory-first food consumption with its destruction audit", async () => {
    const foodId = await insertItem(3577, 2, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const plan = planConsume({
      characterId,
      items: await store.loadForCharacter(characterId),
      itemId: foodId,
      expectedVersion: 1,
      count: 1,
      reason: "food",
    });
    if (!plan) throw new Error("food plan was rejected");

    await store.persist(plan.persist);

    expect(await itemRow(foodId)).toMatchObject({ count: 1, version: 2 });
    expect(await auditRows("item-destroyed")).toEqual([
      expect.objectContaining({
        item_id: foodId,
        details: expect.objectContaining({ count: 1, reason: "food" }),
      }),
    ]);
  });

  it("rolls back a carried persist whose guard misses", async () => {
    const goldId = await insertItem(GOLD_TYPE, 40, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const carried = await store.loadForCharacter(characterId);
    const plan = planMoveToContainer({
      characterId,
      catalog: await loadItemCatalog(),
      items: carried,
      itemId: goldId,
      expectedVersion: 1,
      destinationContainerId: pouchId,
      destinationVersion: 1,
      destinationSlot: 0,
    });
    if (!plan) throw new Error("plan was rejected");
    await pool.query("UPDATE items SET version = version + 1 WHERE id = $1", [
      goldId,
    ]);

    await expect(store.persist(plan.persist)).rejects.toThrow(
      /persist write missed/,
    );

    expect(await itemRow(goldId)).toMatchObject({
      container_id: backpackId,
      slot_index: 1,
      version: 2,
    });
    expect(await auditRows("item-transferred")).toHaveLength(0);
  });

  it("rejects a destination owned by another character", async () => {
    const helmetId = await insertItem(HELMET_TYPE, 1, {
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });
    const otherCharacterId = await createCharacter("beta");
    const otherBackpackId = await insertItem(BACKPACK_TYPE, 1, {
      kind: "equipment",
      characterId: otherCharacterId,
      slot: "backpack",
    });
    await expect(
      store.moveToContainer(characterId, helmetId, 1, otherBackpackId, 1, 0),
    ).rejects.toThrow("item is not owned by character");
  });

  it("moves a world item to an empty tile and audits the transfer", async () => {
    const goldId = await insertItem(GOLD_TYPE, 25, {
      kind: "world",
      x: 100,
      y: 101,
      z: 7,
      stackIndex: 1,
    });

    const mutation = await store.moveWorldItem(
      characterId,
      goldId,
      1,
      { x: 100, y: 101, z: 7 },
      { x: 102, y: 103, z: 7 },
    );

    expect(mutation.after).toHaveLength(1);
    expect(mutation.after[0]).toMatchObject({
      id: goldId,
      version: 2,
      location: {
        kind: "world",
        position: { x: 102, y: 103, z: 7 },
      },
    });
    expect(await itemRow(goldId)).toMatchObject({
      location_type: "world",
      world_x: 102,
      world_y: 103,
      world_z: 7,
      version: 2,
    });
    const audits = await auditRows("item-transferred");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.details).toMatchObject({
      count: 25,
      from: { kind: "world", position: { x: 100, y: 101, z: 7 } },
      to: { kind: "world", position: { x: 102, y: 103, z: 7 } },
    });
  });

  it("merges a thrown stack into a matching stack on the target tile", async () => {
    const sourceId = await insertItem(GOLD_TYPE, 25, {
      kind: "world",
      x: 100,
      y: 101,
      z: 7,
      stackIndex: 1,
    });
    const targetId = await insertItem(GOLD_TYPE, 30, {
      kind: "world",
      x: 102,
      y: 103,
      z: 7,
      stackIndex: 0,
    });

    const mutation = await store.moveWorldItem(
      characterId,
      sourceId,
      1,
      { x: 100, y: 101, z: 7 },
      { x: 102, y: 103, z: 7 },
    );

    expect(mutation.removedItemIds).toEqual([sourceId]);
    expect(await itemRow(sourceId)).toBeUndefined();
    expect(await itemRow(targetId)).toMatchObject({ count: 55, version: 2 });
    expect(await auditRows("item-merged")).toHaveLength(1);
  });

  it("absorbs the target stack when a seeded world item is thrown onto it", async () => {
    const sourceId = await insertItem(
      GOLD_TYPE,
      25,
      { kind: "world", x: 100, y: 101, z: 7, stackIndex: 1 },
      `seed-${randomUUID()}`,
    );
    const targetId = await insertItem(GOLD_TYPE, 30, {
      kind: "world",
      x: 102,
      y: 103,
      z: 7,
      stackIndex: 0,
    });

    const mutation = await store.moveWorldItem(
      characterId,
      sourceId,
      1,
      { x: 100, y: 101, z: 7 },
      { x: 102, y: 103, z: 7 },
    );

    expect(mutation.removedItemIds).toEqual([targetId]);
    expect(await itemRow(targetId)).toBeUndefined();
    expect(await itemRow(sourceId)).toMatchObject({
      count: 55,
      world_x: 102,
      world_y: 103,
      world_stack_index: 0,
      version: 2,
    });
  });

  it("rejects a world move from the wrong source position", async () => {
    const goldId = await insertItem(GOLD_TYPE, 25, {
      kind: "world",
      x: 100,
      y: 101,
      z: 7,
      stackIndex: 1,
    });
    await expect(
      store.moveWorldItem(
        characterId,
        goldId,
        1,
        { x: 99, y: 101, z: 7 },
        { x: 102, y: 103, z: 7 },
      ),
    ).rejects.toThrow("item is not at the expected position");
  });

  it("lets exactly one of two racing world moves of the same item succeed", async () => {
    const goldId = await insertItem(GOLD_TYPE, 25, {
      kind: "world",
      x: 100,
      y: 101,
      z: 7,
      stackIndex: 1,
    });

    const results = await Promise.allSettled([
      store.moveWorldItem(
        characterId,
        goldId,
        1,
        { x: 100, y: 101, z: 7 },
        { x: 102, y: 103, z: 7 },
      ),
      store.moveWorldItem(
        characterId,
        goldId,
        1,
        { x: 100, y: 101, z: 7 },
        { x: 99, y: 100, z: 7 },
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM items WHERE id = $1",
      [goldId],
    );
    expect(Number(count.rows[0]?.count)).toBe(1);
    expect(await itemRow(goldId)).toMatchObject({ version: 2 });
  });

  it("lets exactly one of two racing moves of the same item succeed", async () => {
    const helmetId = await insertItem(HELMET_TYPE, 1, {
      kind: "container",
      containerId: backpackId,
      slot: 2,
    });

    const results = await Promise.allSettled([
      store.moveToContainer(characterId, helmetId, 1, pouchId, 1, 3),
      store.moveToContainer(characterId, helmetId, 1, pouchId, 1, 4),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM items WHERE id = $1",
      [helmetId],
    );
    expect(Number(count.rows[0]?.count)).toBe(1);
    expect(await itemRow(helmetId)).toMatchObject({ version: 2 });
  });

  it("materializes first-touch loot rows with creation audits and clears ownership on decay", async () => {
    // Dead chicken chain: 6042 -(10s)-> 4330 -(300s)-> 4331.
    const { corpse } = await persistCorpse(
      "death:integration-1",
      { x: 100, y: 105, z: 7 },
      6042,
      [{ typeId: GOLD_TYPE, count: 10 }],
    );
    expect(await itemRow(corpse.id)).toMatchObject({ location_type: "world" });
    const created = (await auditRows("item-created")).filter(
      (row) =>
        (row.details as { eventId?: string }).eventId ===
        "death:integration-1",
    );
    expect(created).toHaveLength(2);
    expect(created).toContainEqual(
      expect.objectContaining({
        item_id: corpse.id,
        details: expect.objectContaining({
          eventId: "death:integration-1",
          reason: "monster-loot",
        }),
      }),
    );

    const mutation = await store.decayWorldItem(corpse.id, corpse.version);
    expect(mutation.after).toMatchObject([
      { id: corpse.id, typeId: 4330, attributes: {} },
    ]);
    expect(mutation.removedItemIds ?? []).toHaveLength(0);
    expect(await auditRows("item-transformed")).toMatchObject([
      {
        item_id: corpse.id,
        details: { reason: "decay", fromTypeId: 6042, toTypeId: 4330 },
      },
    ]);
  });

  it("destroys and audits contents a decayed corpse can no longer hold", async () => {
    const { corpse } = await persistCorpse(
      "death:integration-2",
      { x: 100, y: 106, z: 7 },
      4330,
      [
        { typeId: GOLD_TYPE, count: 10 },
        { typeId: GOLD_TYPE, count: 5 },
      ],
    );

    // 4330 -> 4331 drops container capacity to zero.
    const mutation = await store.decayWorldItem(corpse.id, corpse.version);
    expect(mutation.after).toMatchObject([{ typeId: 4331 }]);
    expect(mutation.removedItemIds).toHaveLength(2);
    const remaining = await pool.query<{ count: string }>(
      "SELECT count(*) FROM items WHERE container_id = $1",
      [corpse.id],
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
    expect(await auditRows("item-destroyed")).toHaveLength(2);

    // 4331 -> 4332 -> removed; the removal is audited too.
    await store.decayWorldItem(corpse.id, corpse.version + 1);
    const removal = await store.decayWorldItem(
      corpse.id,
      corpse.version + 2,
    );
    expect(removal.after).toEqual([]);
    expect(removal.removedItemIds).toEqual([corpse.id]);
    expect(await auditRows("item-destroyed")).toHaveLength(3);
    const gone = await pool.query<{ count: string }>(
      "SELECT count(*) FROM items WHERE id = $1",
      [corpse.id],
    );
    expect(Number(gone.rows[0]?.count)).toBe(0);
  });

  it("rejects a stale decay transaction and lets exactly one of two racing decays succeed", async () => {
    const { corpse } = await persistCorpse(
      "death:integration-3",
      { x: 100, y: 107, z: 7 },
      6042,
      [],
    );

    await expect(
      store.decayWorldItem(corpse.id, corpse.version + 1),
    ).rejects.toThrow();

    const results = await Promise.allSettled([
      store.decayWorldItem(corpse.id, corpse.version),
      store.decayWorldItem(corpse.id, corpse.version),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await itemRow(corpse.id)).toMatchObject({ version: 2 });
  });

  it("retries a persist that collides with a concurrent character update", async () => {
    // The live scenario behind "could not serialize access due to concurrent
    // update": the periodic character snapshot save updates the character row
    // outside the item write lane while a persist waits to lock it.
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "UPDATE characters SET version = version + 1 WHERE id = $1",
        [characterId],
      );
      const persist = persistCorpse(
        "death:integration-retry",
        { x: 100, y: 108, z: 7 },
        6042,
        [{ typeId: GOLD_TYPE, count: 3 }],
      );
      // Let the persist reach the character row lock and block on it.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await blocker.query("COMMIT");
      const { corpse } = await persist;
      expect(await itemRow(corpse.id)).toMatchObject({
        location_type: "world",
      });
    } finally {
      blocker.release();
    }
  });

  it("survives a kill-time burst of character saves while moving a corpse", async () => {
    // Attacking creates immediate character saves (experience awards flush on
    // every kill), so combat produces back-to-back transactions on the
    // character row. Two consecutive saves collide with the same persist;
    // the retry with backoff must outlast the burst without duplicating rows
    // or audits.
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const firstSave = await pool.connect();
    const secondSave = await pool.connect();
    try {
      await firstSave.query("BEGIN");
      await firstSave.query(
        "UPDATE characters SET version = version + 1 WHERE id = $1",
        [characterId],
      );
      const persist = persistCorpse(
        "death:integration-burst",
        { x: 100, y: 109, z: 7 },
        6042,
        [{ typeId: GOLD_TYPE, count: 7 }],
      );
      await sleep(200); // the persist is blocked on the character row lock
      await secondSave.query("BEGIN");
      await firstSave.query("COMMIT"); // aborts the persist's first attempt
      await secondSave.query(
        "UPDATE characters SET version = version + 1 WHERE id = $1",
        [characterId],
      );
      await sleep(200); // the retry blocks on the second queued save
      await secondSave.query("COMMIT"); // aborts again; the next attempt wins
      const { corpse } = await persist;
      expect(await itemRow(corpse.id)).toMatchObject({
        location_type: "world",
      });
      // Rolled-back attempts must leave no duplicate rows or audits behind.
      const rows = await pool.query<{ count: string }>(
        "SELECT count(*) FROM items WHERE id = $1",
        [corpse.id],
      );
      expect(Number(rows.rows[0]?.count)).toBe(1);
      const created = (await auditRows("item-created")).filter(
        (row) =>
          (row.details as { eventId?: string }).eventId ===
          "death:integration-burst",
      );
      expect(created).toHaveLength(2);
    } finally {
      firstSave.release();
      secondSave.release();
    }
  });

  it("commits an NPC fare, destination, inventory mutation, and audits atomically", async () => {
    await insertItem(GOLD_TYPE, 70, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    await insertItem(GOLD_TYPE, 50, {
      kind: "container",
      containerId: pouchId,
      slot: 1,
    });
    const character = await pool.query<{ version: number }>(
      "SELECT version FROM characters WHERE id = $1",
      [characterId],
    );
    const expectedVersion = character.rows[0]?.version;
    if (!expectedVersion) throw new Error("character version is missing");

    const result = await travelStore.commit(
      characterId,
      expectedVersion,
      { x: 120, y: 220, z: 6 },
      100,
      "captain-bluebear",
      "carlin",
    );

    expect(result).toMatchObject({
      status: "committed",
      characterVersion: expectedVersion + 1,
    });
    const persisted = await pool.query<{
      version: number;
      position_x: number;
      position_y: number;
      position_z: number;
    }>(
      `SELECT version, position_x, position_y, position_z
       FROM characters WHERE id = $1`,
      [characterId],
    );
    expect(persisted.rows[0]).toEqual({
      version: expectedVersion + 1,
      position_x: 120,
      position_y: 220,
      position_z: 6,
    });
    const balance = await pool.query<{ total: string }>(
      "SELECT coalesce(sum(count), 0)::text AS total FROM items WHERE item_type_id = $1",
      [GOLD_TYPE],
    );
    expect(Number(balance.rows[0]?.total)).toBe(20);
    expect(await auditRows("item-destroyed")).toHaveLength(2);
    expect(await auditRows("npc-travel")).toMatchObject([
      {
        details: {
          npcTypeId: "captain-bluebear",
          offerId: "carlin",
          cost: 100,
          destination: { x: 120, y: 220, z: 6 },
        },
      },
    ]);
  });

  it("commits an exact NPC fare without locking backpack space", async () => {
    await pool.query("DELETE FROM items WHERE id = $1", [pouchId]);
    await pool.query("DELETE FROM items WHERE id = $1", [backpackId]);
    await insertItem(GOLD_TYPE, 100, {
      kind: "inventory",
      characterId,
      slot: 0,
    });
    const character = await pool.query<{ version: number }>(
      "SELECT version FROM characters WHERE id = $1",
      [characterId],
    );
    const expectedVersion = character.rows[0]?.version;
    if (!expectedVersion) throw new Error("character version is missing");

    await expect(
      travelStore.commit(
        characterId,
        expectedVersion,
        { x: 120, y: 220, z: 6 },
        100,
        "captain-bluebear",
        "carlin",
      ),
    ).resolves.toMatchObject({
      status: "committed",
      mutation: { removedItemIds: expect.any(Array) },
    });
  });

  it("pays an exact NPC fare from platinum and returns audited gold change", async () => {
    await insertItem(PLATINUM_TYPE, 50, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const character = await pool.query<{ version: number }>(
      "SELECT version FROM characters WHERE id = $1",
      [characterId],
    );
    const expectedVersion = character.rows[0]?.version;
    if (!expectedVersion) throw new Error("character version is missing");

    const result = await travelStore.commit(
      characterId,
      expectedVersion,
      { x: 120, y: 220, z: 6 },
      110,
      "captain-bluebear",
      "carlin",
    );

    expect(result).toMatchObject({
      status: "committed",
      mutation: {
        after: expect.arrayContaining([
          expect.objectContaining({ typeId: PLATINUM_TYPE, count: 48 }),
          expect.objectContaining({ typeId: GOLD_TYPE, count: 90 }),
        ]),
      },
    });
    const currency = await pool.query<{
      item_type_id: number;
      count: number;
    }>(
      `SELECT item_type_id, count FROM items
       WHERE item_type_id IN ($1, $2)
       ORDER BY item_type_id`,
      [GOLD_TYPE, PLATINUM_TYPE],
    );
    expect(currency.rows).toEqual([
      { item_type_id: GOLD_TYPE, count: 90 },
      { item_type_id: PLATINUM_TYPE, count: 48 },
    ]);
    expect(await auditRows("item-destroyed")).toMatchObject([
      {
        details: {
          itemTypeId: PLATINUM_TYPE,
          count: 2,
          reason: "npc-travel",
        },
      },
    ]);
    expect(await auditRows("item-created")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            itemTypeId: GOLD_TYPE,
            count: 90,
            reason: "npc-travel-change",
          }),
        }),
      ]),
    );
  });

  it("leaves money, position, version, and audit untouched when a fare is insufficient", async () => {
    await insertItem(GOLD_TYPE, 20, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const before = await pool.query<{
      version: number;
      position_x: number;
      position_y: number;
      position_z: number;
    }>(
      `SELECT version, position_x, position_y, position_z
       FROM characters WHERE id = $1`,
      [characterId],
    );
    const expectedVersion = before.rows[0]?.version;
    if (!expectedVersion) throw new Error("character version is missing");

    await expect(
      travelStore.commit(
        characterId,
        expectedVersion,
        { x: 120, y: 220, z: 6 },
        100,
        "captain-bluebear",
        "carlin",
      ),
    ).resolves.toEqual({ status: "insufficient-funds" });

    const after = await pool.query(
      `SELECT version, position_x, position_y, position_z
       FROM characters WHERE id = $1`,
      [characterId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(await auditRows("item-destroyed")).toEqual([]);
    expect(await auditRows("npc-travel")).toEqual([]);
  });

  it("lets only one concurrent travel spend the same fare", async () => {
    await insertItem(GOLD_TYPE, 80, {
      kind: "container",
      containerId: backpackId,
      slot: 1,
    });
    const character = await pool.query<{ version: number }>(
      "SELECT version FROM characters WHERE id = $1",
      [characterId],
    );
    const expectedVersion = character.rows[0]?.version;
    if (!expectedVersion) throw new Error("character version is missing");

    const results = await Promise.allSettled([
      travelStore.commit(
        characterId,
        expectedVersion,
        { x: 120, y: 220, z: 6 },
        60,
        "captain-bluebear",
        "carlin",
      ),
      travelStore.commit(
        characterId,
        expectedVersion,
        { x: 130, y: 230, z: 6 },
        60,
        "captain-bluebear",
        "edron",
      ),
    ]);

    expect(
      results.filter(
        (result) =>
          result.status === "fulfilled" &&
          result.value.status === "committed",
      ),
    ).toHaveLength(1);
    const balance = await pool.query<{ total: string }>(
      "SELECT coalesce(sum(count), 0)::text AS total FROM items WHERE item_type_id = $1",
      [GOLD_TYPE],
    );
    expect(Number(balance.rows[0]?.total)).toBe(20);
    expect(await auditRows("npc-travel")).toHaveLength(1);
  });
});
