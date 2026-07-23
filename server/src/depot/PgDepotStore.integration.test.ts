import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import type { DepotCache } from "./DepotCache";
import type { DepotItemRow } from "./DepotItemRow";
import { itemFromRow } from "./itemFromRow";
import type { LoadedDepot } from "./LoadedDepot";
import { PgDepotStore } from "./PgDepotStore";
import { planDepotDeposit } from "./planDepotDeposit";
import { planDepotWithdraw } from "./planDepotWithdraw";
import { planStashDeposit } from "./planStashDeposit";
import { planStashWithdraw } from "./planStashWithdraw";
import { depotItemColumns } from "./sql/depotItemColumns";

const TEST_SCHEMA = "depot_store_integration";
const MIGRATION_LOCK_KEY = 7_281_006;
const DEPOT_ID = 7;
const AXE_TYPE = 3274;
const BACKPACK_TYPE = 2854;
const GOLD_COIN_TYPE = 3031;
const HEALTH_POTION_TYPE = 266;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgDepotStore;
let catalog: ItemCatalog;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en') RETURNING id`,
    [`depot-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Depot ${label}`,
    vocation: "Knight",
    lookType: 128,
  });
  const character = (await characterStore.listByAccountId(accountId))[0];
  if (!character) throw new Error("character was not created");
  await pool.query(
    `WITH RECURSIVE owned AS (
       SELECT id FROM items WHERE character_id = $1
       UNION ALL
       SELECT child.id FROM items child JOIN owned ON child.container_id = owned.id
     )
     DELETE FROM items WHERE id IN (SELECT id FROM owned)`,
    [character.id],
  );
  await pool.query("DELETE FROM audit_log WHERE character_id = $1", [
    character.id,
  ]);
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, location_type, character_id, equipment_slot
     ) VALUES ($1, $2, 'equipment', $3, 'backpack')`,
    [randomUUID(), BACKPACK_TYPE, character.id],
  );
  return character.id;
};

const insertBackpackItem = async (
  characterId: string,
  itemTypeId: number,
  count: number,
  slot: number,
): Promise<string> => {
  const backpack = await pool.query<{ id: string }>(
    `SELECT id FROM items
     WHERE character_id = $1 AND location_type = 'equipment'
       AND equipment_slot = 'backpack'`,
    [characterId],
  );
  const backpackId = backpack.rows[0]?.id;
  if (!backpackId) throw new Error("test backpack is missing");
  const itemId = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, container_id, slot_index
     ) VALUES ($1, $2, $3, 'container', $4, $5)`,
    [itemId, itemTypeId, count, backpackId, slot],
  );
  return itemId;
};

const insertDepotItem = async (
  characterId: string,
  itemTypeId: number,
  count: number,
  slot: number,
): Promise<string> => {
  const itemId = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, character_id, slot_index, depot_id
     ) VALUES ($1, $2, $3, 'depot', $4, $5, $6)`,
    [itemId, itemTypeId, count, characterId, slot, DEPOT_ID],
  );
  return itemId;
};

const loadCarried = async (characterId: string): Promise<Item[]> => {
  const result = await pool.query<DepotItemRow>(
    `WITH RECURSIVE owned AS (
       SELECT i.*, 1 AS item_depth FROM items i
       WHERE i.character_id = $1
         AND i.location_type = 'equipment'
       UNION ALL
       SELECT child.*, owned.item_depth + 1 FROM items child
       JOIN owned ON child.container_id = owned.id
       WHERE child.location_type IN ('container', 'corpse')
         AND owned.item_depth < 8
     )
     SELECT ${depotItemColumns} FROM owned ORDER BY item_depth, id`,
    [characterId],
  );
  return result.rows.map(itemFromRow);
};

const cacheOf = (loaded: LoadedDepot): DepotCache => ({
  items: loaded.items,
  stash: loaded.stash,
  depotRevisions: loaded.depotRevisions,
  inboxRevision: loaded.inboxRevision,
  stashRevision: loaded.stashRevision,
});

const auditCount = async (
  operation: string,
  eventType = "item-transferred",
): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_log
     WHERE event_type = $1 AND details->>'operation' = $2`,
    [eventType, operation],
  );
  return Number(result.rows[0]?.count ?? 0);
};

databaseDescribe("PgDepotStore integration", () => {
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
      "012_bank.sql",
      "013_shops.sql",
      "014_character_storages.sql",
      "015_depot_and_inbox.sql",
      "018_pvp.sql",
      "019_houses.sql",
      "020_social.sql",
      "021_moderation.sql",
      "023_character_action_bar.sql",
      "029_character_potion_action_bar.sql",
      "032_remove_loose_inventory.sql",
      "034_unified_action_bar.sql",
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
    catalog = await loadItemCatalog();
    store = new PgDepotStore(pool, catalog);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM inbox_deliveries");
    await pool.query("DELETE FROM supply_stash");
    await pool.query("DELETE FROM character_depots");
    await pool.query("DELETE FROM character_storage_state");
    await pool.query("DELETE FROM shop_stock");
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
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

  it("loads depot, inbox, and stash state in one snapshot", async () => {
    const characterId = await createCharacter("Loader");
    await insertDepotItem(characterId, AXE_TYPE, 1, 0);
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, character_id, slot_index
       ) VALUES ($1, $2, 1, 'inbox', $3, 0)`,
      [randomUUID(), AXE_TYPE, characterId],
    );
    await pool.query(
      `INSERT INTO supply_stash (character_id, item_type_id, count)
       VALUES ($1, $2, 250)`,
      [characterId, GOLD_COIN_TYPE],
    );
    await pool.query(
      `INSERT INTO character_depots (character_id, depot_id, revision)
       VALUES ($1, $2, 5)`,
      [characterId, DEPOT_ID],
    );

    const loaded = await store.loadForCharacter(characterId);

    expect(loaded.items).toHaveLength(2);
    expect(loaded.stash.get(GOLD_COIN_TYPE)).toBe(250);
    expect(loaded.depotRevisions.get(DEPOT_ID)).toBe(5);
    expect(loaded.inboxRevision).toBe(1);
  });

  it("persists a planned deposit atomically with revision bump and audit", async () => {
    const characterId = await createCharacter("Depositor");
    const itemId = await insertBackpackItem(characterId, AXE_TYPE, 1, 0);
    const carried = await loadCarried(characterId);
    const depot = cacheOf(await store.loadForCharacter(characterId));
    const plan = planDepotDeposit({
      characterId,
      catalog,
      carried: { items: carried },
      depot,
      depotId: DEPOT_ID,
      expectedDepotRevision: 1,
      itemId,
      expectedItemRevision: 1,
    });
    if (plan.status !== "ok") throw new Error(`plan failed: ${plan.status}`);

    await store.persist(plan.persist);

    const row = await pool.query<DepotItemRow>(
      `SELECT ${depotItemColumns} FROM items WHERE id = $1`,
      [itemId],
    );
    expect(row.rows[0]?.location_type).toBe("depot");
    expect(row.rows[0]?.depot_id).toBe(DEPOT_ID);
    expect(row.rows[0]?.version).toBe(2);
    const revision = await pool.query<{ revision: number }>(
      `SELECT revision FROM character_depots
       WHERE character_id = $1 AND depot_id = $2`,
      [characterId, DEPOT_ID],
    );
    expect(revision.rows[0]?.revision).toBe(2);
    expect(await auditCount("depot-deposit")).toBe(1);
    const reloaded = await store.loadForCharacter(characterId);
    expect(reloaded.items.map((item) => item.id)).toContain(itemId);
  });

  it("rolls back a persist whose guarded write misses", async () => {
    const characterId = await createCharacter("Guarded");
    const itemId = await insertBackpackItem(characterId, AXE_TYPE, 1, 0);
    const carried = await loadCarried(characterId);
    const depot = cacheOf(await store.loadForCharacter(characterId));
    const plan = planDepotDeposit({
      characterId,
      catalog,
      carried: { items: carried },
      depot,
      depotId: DEPOT_ID,
      expectedDepotRevision: 1,
      itemId,
      expectedItemRevision: 1,
    });
    if (plan.status !== "ok") throw new Error(`plan failed: ${plan.status}`);
    await pool.query("UPDATE items SET version = version + 1 WHERE id = $1", [
      itemId,
    ]);

    await expect(store.persist(plan.persist)).rejects.toThrow(
      /persist write missed/,
    );

    const row = await pool.query<DepotItemRow>(
      `SELECT ${depotItemColumns} FROM items WHERE id = $1`,
      [itemId],
    );
    expect(row.rows[0]?.location_type).toBe("container");
    const revision = await pool.query(
      `SELECT revision FROM character_depots
       WHERE character_id = $1 AND depot_id = $2`,
      [characterId, DEPOT_ID],
    );
    expect(revision.rows).toHaveLength(0);
    expect(await auditCount("depot-deposit")).toBe(0);
  });

  it("withdraws a stack by filling carried stacks before creating a remainder", async () => {
    const characterId = await createCharacter("Merger");
    await insertBackpackItem(characterId, GOLD_COIN_TYPE, 60, 0);
    const storedId = await insertDepotItem(
      characterId,
      GOLD_COIN_TYPE,
      80,
      0,
    );
    const carried = await loadCarried(characterId);
    const depot = cacheOf(await store.loadForCharacter(characterId));
    const plan = planDepotWithdraw({
      characterId,
      catalog,
      carried: { items: carried, capacityMax: 100_000 },
      depot,
      depotId: DEPOT_ID,
      source: "depot",
      expectedSourceRevision: 1,
      itemId: storedId,
      expectedItemRevision: 1,
    });
    if (plan.status !== "ok") throw new Error(`plan failed: ${plan.status}`);

    await store.persist(plan.persist);

    const carriedAfter = await loadCarried(characterId);
    const coinCounts = carriedAfter
      .filter((item) => item.typeId === GOLD_COIN_TYPE)
      .map((item) => item.count)
      .sort((left, right) => left - right);
    expect(coinCounts).toEqual([40, 100]);
    const storedAfter = await store.loadForCharacter(characterId);
    expect(storedAfter.items).toHaveLength(0);
    expect(await auditCount("depot-withdrawal", "item-merged")).toBe(1);
    expect(await auditCount("depot-withdrawal")).toBe(1);
  });

  it("stows and retrieves through absolute stash writes", async () => {
    const characterId = await createCharacter("Stasher");
    const potionsId = await insertBackpackItem(characterId, HEALTH_POTION_TYPE, 50, 0);
    const carried = await loadCarried(characterId);
    const depot = cacheOf(await store.loadForCharacter(characterId));
    const depositPlan = planStashDeposit({
      characterId,
      catalog,
      carried: { items: carried },
      depot,
      expectedStashRevision: 1,
      itemId: potionsId,
      expectedItemRevision: 1,
      count: 50,
    });
    if (depositPlan.status !== "ok") {
      throw new Error(`plan failed: ${depositPlan.status}`);
    }
    await store.persist(depositPlan.persist);

    const stashed = await store.loadForCharacter(characterId);
    expect(stashed.stash.get(HEALTH_POTION_TYPE)).toBe(50);
    expect(stashed.stashRevision).toBe(2);

    const withdrawPlan = planStashWithdraw({
      characterId,
      catalog,
      carried: { items: await loadCarried(characterId), capacityMax: 100_000 },
      depot: cacheOf(stashed),
      expectedStashRevision: 2,
      itemTypeId: HEALTH_POTION_TYPE,
      count: 30,
    });
    if (withdrawPlan.status !== "ok") {
      throw new Error(`plan failed: ${withdrawPlan.status}`);
    }
    await store.persist(withdrawPlan.persist);

    const after = await store.loadForCharacter(characterId);
    expect(after.stash.get(HEALTH_POTION_TYPE)).toBe(20);
    const carriedAfter = await loadCarried(characterId);
    expect(
      carriedAfter
        .filter((item) => item.typeId === HEALTH_POTION_TYPE)
        .reduce((total, item) => total + item.count, 0),
    ).toBe(30);
    expect(await auditCount("stash-withdrawal", "item-created")).toBe(1);
  });

  it("delivers mail with the recipient id and subtree for cache injection", async () => {
    const senderId = await createCharacter("Sender");
    const recipientId = await createCharacter("Recipient");
    const parcelId = await insertBackpackItem(senderId, AXE_TYPE, 1, 0);

    const result = await store.sendMail({
      deliveryKey: `mail:${senderId}:${randomUUID()}`,
      senderCharacterId: senderId,
      itemId: parcelId,
      itemRevision: 1,
      normalizedRecipientName: "depot recipient",
      expiresAt: new Date(Date.now() + 60_000),
    });

    if (result.status !== "committed") {
      throw new Error(`mail failed: ${result.status}`);
    }
    expect(result.recipientCharacterId).toBe(recipientId);
    expect(result.deliveredItems).toHaveLength(1);
    expect(result.deliveredItems[0]?.location).toEqual({
      kind: "inbox",
      characterId: recipientId,
      slot: 0,
    });
    const recipientState = await store.loadForCharacter(recipientId);
    expect(recipientState.items.map((item) => item.id)).toContain(parcelId);
  });

  it("delivers a reward exactly once and returns the created item", async () => {
    const characterId = await createCharacter("Rewarded");
    const deliveryKey = `reward:test:${randomUUID()}`;
    const request = {
      deliveryKey,
      recipientCharacterId: characterId,
      itemTypeId: AXE_TYPE,
      count: 1,
    };

    const first = await store.deliverReward(request);
    const second = await store.deliverReward(request);

    expect(first.idempotent).toBe(false);
    expect(first.item?.location.kind).toBe("inbox");
    expect(second.idempotent).toBe(true);
    expect(second.item).toBeNull();
    const state = await store.loadForCharacter(characterId);
    expect(state.items).toHaveLength(1);
  });

  it("returns expired mail to the sender with subtree details", async () => {
    const senderId = await createCharacter("Expired");
    const recipientId = await createCharacter("Ghost");
    const parcelId = await insertBackpackItem(senderId, AXE_TYPE, 1, 0);
    const sent = await store.sendMail({
      deliveryKey: `mail:${senderId}:${randomUUID()}`,
      senderCharacterId: senderId,
      itemId: parcelId,
      itemRevision: 1,
      normalizedRecipientName: "depot ghost",
      expiresAt: new Date(Date.now() - 1_000),
    });
    if (sent.status !== "committed") throw new Error("mail failed");
    expect(sent.recipientCharacterId).toBe(recipientId);

    const results = await store.returnExpired(new Date(), 10);

    expect(results).toHaveLength(1);
    expect(results[0]?.removedItemIds).toContain(parcelId);
    expect(results[0]?.items[0]?.location).toEqual({
      kind: "inbox",
      characterId: senderId,
      slot: 0,
    });
    const recipientState = await store.loadForCharacter(recipientId);
    expect(recipientState.items).toHaveLength(0);
    const senderState = await store.loadForCharacter(senderId);
    expect(senderState.items.map((item) => item.id)).toContain(parcelId);
  });

  it("claims the inbox delivery when a withdrawal persists", async () => {
    const senderId = await createCharacter("Claimant");
    const recipientId = await createCharacter("Collector");
    const parcelId = await insertBackpackItem(senderId, AXE_TYPE, 1, 0);
    const sent = await store.sendMail({
      deliveryKey: `mail:${senderId}:${randomUUID()}`,
      senderCharacterId: senderId,
      itemId: parcelId,
      itemRevision: 1,
      normalizedRecipientName: "depot collector",
      expiresAt: new Date(Date.now() + 60_000),
    });
    if (sent.status !== "committed") throw new Error("mail failed");
    const loaded = await store.loadForCharacter(recipientId);
    const stored = loaded.items.find((item) => item.id === parcelId);
    if (!stored) throw new Error("mail item missing from inbox");
    const plan = planDepotWithdraw({
      characterId: recipientId,
      catalog,
      carried: {
        items: await loadCarried(recipientId),
        capacityMax: 100_000,
      },
      depot: cacheOf(loaded),
      depotId: DEPOT_ID,
      source: "inbox",
      expectedSourceRevision: loaded.inboxRevision,
      itemId: parcelId,
      expectedItemRevision: stored.version,
    });
    if (plan.status !== "ok") throw new Error(`plan failed: ${plan.status}`);

    await store.persist(plan.persist);

    const delivery = await pool.query<{ status: string }>(
      `SELECT status FROM inbox_deliveries WHERE item_id = $1 OR original_item_id = $1`,
      [parcelId],
    );
    expect(delivery.rows[0]?.status).toBe("claimed");
    const carriedAfter = await loadCarried(recipientId);
    expect(carriedAfter.map((item) => item.id)).toContain(parcelId);
  });

  it("replays a mail delivery key idempotently without duplicating the item", async () => {
    const senderId = await createCharacter("Replayer");
    const recipientId = await createCharacter("Replayed");
    const parcelId = await insertBackpackItem(senderId, AXE_TYPE, 1, 0);
    const deliveryKey = `mail:${senderId}:${randomUUID()}`;
    const request = {
      deliveryKey,
      senderCharacterId: senderId,
      itemId: parcelId,
      itemRevision: 1,
      normalizedRecipientName: "depot replayed",
      expiresAt: new Date(Date.now() + 60_000),
    };

    const first = await store.sendMail(request);
    const replay = await store.sendMail(request);

    if (first.status !== "committed" || replay.status !== "committed") {
      throw new Error("mail send failed");
    }
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.deliveredItems).toHaveLength(0);
    // Conservation: one item row, in exactly one inbox.
    const rows = await pool.query<{ character_id: string; count: number }>(
      `SELECT character_id, count FROM items
       WHERE id = $1 AND location_type = 'inbox'`,
      [parcelId],
    );
    expect(rows.rows).toEqual([{ character_id: recipientId, count: 1 }]);

    // A key replay claiming a different sender is an integrity violation.
    const intruderId = await createCharacter("Intruder");
    await expect(
      store.sendMail({ ...request, senderCharacterId: intruderId }),
    ).rejects.toThrow(/reused with different ownership/);
  });

  it("resolves two racing sends of the same item to exactly one delivery", async () => {
    const senderId = await createCharacter("Racer");
    const recipientId = await createCharacter("Race Target");
    const parcelId = await insertBackpackItem(senderId, AXE_TYPE, 1, 0);
    const request = (suffix: string) => ({
      deliveryKey: `mail:${senderId}:race-${suffix}`,
      senderCharacterId: senderId,
      itemId: parcelId,
      itemRevision: 1,
      normalizedRecipientName: "depot race target",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const results = await Promise.allSettled([
      store.sendMail(request("a")),
      store.sendMail(request("b")),
    ]);

    const committed = results.filter(
      (result) =>
        result.status === "fulfilled" && result.value.status === "committed",
    );
    // Exactly one send wins; the loser sees not-owned (stale revision /
    // moved item) or a serialization abort — never a second delivery.
    expect(committed).toHaveLength(1);
    const itemRows = await pool.query<{
      location_type: string;
      character_id: string;
    }>("SELECT location_type, character_id FROM items WHERE id = $1", [
      parcelId,
    ]);
    expect(itemRows.rows).toEqual([
      { location_type: "inbox", character_id: recipientId },
    ]);
    const deliveries = await pool.query(
      "SELECT delivery_key FROM inbox_deliveries WHERE item_id = $1",
      [parcelId],
    );
    expect(deliveries.rows).toHaveLength(1);
  });
});
