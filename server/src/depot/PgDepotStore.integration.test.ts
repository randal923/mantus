import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgDepotStore } from "./PgDepotStore";

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
    store = new PgDepotStore(pool, await loadItemCatalog());
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

  it("serializes competing deposits and never shares a depot slot", async () => {
    const characterId = await createCharacter("Alpha");
    const firstItemId = await insertBackpackItem(
      characterId,
      AXE_TYPE,
      1,
      0,
    );
    const secondItemId = await insertBackpackItem(
      characterId,
      AXE_TYPE,
      1,
      1,
    );
    const initial = await store.browse(
      characterId,
      DEPOT_ID,
      "depot",
      1,
      null,
    );

    const attempts = await Promise.allSettled([
      store.deposit(
        characterId,
        DEPOT_ID,
        initial.snapshot.depotRevision,
        firstItemId,
        1,
      ),
      store.deposit(
        characterId,
        DEPOT_ID,
        initial.snapshot.depotRevision,
        secondItemId,
        1,
      ),
    ]);
    const committed = attempts.filter(
      (attempt) =>
        attempt.status === "fulfilled" && attempt.value.status === "committed",
    );
    expect(committed).toHaveLength(1);
    const afterRace = await pool.query<{
      id: string;
      slot_index: number;
    }>(
      `SELECT id, slot_index FROM items
       WHERE character_id = $1 AND location_type = 'depot' AND depot_id = $2`,
      [characterId, DEPOT_ID],
    );
    expect(afterRace.rows).toHaveLength(1);
    expect(afterRace.rows[0]?.slot_index).toBe(0);

    const remainingItemId =
      afterRace.rows[0]?.id === firstItemId ? secondItemId : firstItemId;
    const refreshed = await store.browse(
      characterId,
      DEPOT_ID,
      "depot",
      1,
      null,
    );
    const retry = await store.deposit(
      characterId,
      DEPOT_ID,
      refreshed.snapshot.depotRevision,
      remainingItemId,
      1,
    );
    expect(retry.status).toBe("committed");
    const stored = await pool.query<{ id: string; slot_index: number }>(
      `SELECT id, slot_index FROM items
       WHERE character_id = $1 AND location_type = 'depot' AND depot_id = $2
       ORDER BY slot_index`,
      [characterId, DEPOT_ID],
    );
    expect(stored.rows).toEqual([
      expect.objectContaining({ slot_index: 0 }),
      expect.objectContaining({ slot_index: 1 }),
    ]);
    expect(new Set(stored.rows.map((row) => row.slot_index)).size).toBe(2);
    expect(new Set(stored.rows.map((row) => row.id))).toEqual(
      new Set([firstItemId, secondItemId]),
    );
    expect(await auditCount("depot-deposit")).toBe(2);
  });

  it("merges a stackable depot withdrawal into a carried stack", async () => {
    const characterId = await createCharacter("Merge");
    const depotItemId = await insertBackpackItem(
      characterId,
      GOLD_COIN_TYPE,
      20,
      0,
    );
    const initial = await store.browse(
      characterId,
      DEPOT_ID,
      "depot",
      1,
      null,
    );
    const deposited = await store.deposit(
      characterId,
      DEPOT_ID,
      initial.snapshot.depotRevision,
      depotItemId,
      1,
    );
    expect(deposited.status).toBe("committed");
    if (deposited.status !== "committed") return;
    const depositedItem = deposited.mutation.after.find(
      (item) => item.id === depotItemId,
    );
    if (!depositedItem) throw new Error("depot mutation omitted its item");
    const carriedItemId = await insertBackpackItem(
      characterId,
      GOLD_COIN_TYPE,
      30,
      0,
    );

    const withdrawn = await store.withdraw(
      characterId,
      DEPOT_ID,
      "depot",
      deposited.snapshot.depotRevision,
      depotItemId,
      depositedItem.version,
      400,
    );

    expect(withdrawn.status).toBe("committed");
    if (withdrawn.status !== "committed") return;
    expect(withdrawn.mutation.removedItemIds).toEqual([depotItemId]);
    const carried = await pool.query<{ id: string; count: number }>(
      `SELECT item.id, item.count FROM items item
       JOIN items backpack ON backpack.id = item.container_id
       WHERE backpack.character_id = $1
         AND backpack.equipment_slot = 'backpack'
         AND item.item_type_id = $2`,
      [characterId, GOLD_COIN_TYPE],
    );
    expect(carried.rows).toEqual([{ id: carriedItemId, count: 50 }]);
    expect(await auditCount("depot-withdrawal")).toBe(1);
    expect(await auditCount("depot-withdrawal", "item-merged")).toBe(1);
  });

  it("fills a carried stack and moves only the depot remainder", async () => {
    const characterId = await createCharacter("Partial Merge");
    const depotItemId = await insertBackpackItem(
      characterId,
      GOLD_COIN_TYPE,
      30,
      0,
    );
    const initial = await store.browse(
      characterId,
      DEPOT_ID,
      "depot",
      1,
      null,
    );
    const deposited = await store.deposit(
      characterId,
      DEPOT_ID,
      initial.snapshot.depotRevision,
      depotItemId,
      1,
    );
    expect(deposited.status).toBe("committed");
    if (deposited.status !== "committed") return;
    const depositedItem = deposited.mutation.after.find(
      (item) => item.id === depotItemId,
    );
    if (!depositedItem) throw new Error("depot mutation omitted its item");
    const carriedItemId = await insertBackpackItem(
      characterId,
      GOLD_COIN_TYPE,
      80,
      0,
    );

    const withdrawn = await store.withdraw(
      characterId,
      DEPOT_ID,
      "depot",
      deposited.snapshot.depotRevision,
      depotItemId,
      depositedItem.version,
      400,
    );

    expect(withdrawn.status).toBe("committed");
    if (withdrawn.status !== "committed") return;
    expect(withdrawn.mutation.removedItemIds).toBeUndefined();
    const carried = await pool.query<{ id: string; count: number }>(
      `SELECT item.id, item.count FROM items item
       JOIN items backpack ON backpack.id = item.container_id
       WHERE backpack.character_id = $1
         AND backpack.equipment_slot = 'backpack'
         AND item.item_type_id = $2`,
      [characterId, GOLD_COIN_TYPE],
    );
    expect(carried.rows).toEqual(
      expect.arrayContaining([
        { id: carriedItemId, count: 100 },
        { id: depotItemId, count: 10 },
      ]),
    );
    expect(carried.rows).toHaveLength(2);
    const mergeAudit = await pool.query<{
      moved_count: string;
      source_remaining: string;
    }>(
      `SELECT details->>'movedCount' AS moved_count,
         details->>'sourceRemaining' AS source_remaining
       FROM audit_log
       WHERE event_type = 'item-merged'
         AND details->>'operation' = 'depot-withdrawal'`,
    );
    expect(mergeAudit.rows).toEqual([
      { moved_count: "20", source_remaining: "10" },
    ]);
  });

  it("merges an inbox claim and completes its delivery record", async () => {
    const characterId = await createCharacter("Inbox Merge");
    const carriedItemId = await insertBackpackItem(
      characterId,
      GOLD_COIN_TYPE,
      30,
      0,
    );
    const deliveryKey = "reward:merge:inbox";
    const delivered = await store.deliverReward({
      deliveryKey,
      recipientCharacterId: characterId,
      itemTypeId: GOLD_COIN_TYPE,
      count: 20,
    });
    const initial = await store.browse(
      characterId,
      DEPOT_ID,
      "inbox",
      1,
      null,
    );

    const withdrawn = await store.withdraw(
      characterId,
      DEPOT_ID,
      "inbox",
      initial.snapshot.inboxRevision,
      delivered.itemId,
      1,
      400,
    );

    expect(withdrawn.status).toBe("committed");
    if (withdrawn.status !== "committed") return;
    expect(withdrawn.mutation.removedItemIds).toEqual([delivered.itemId]);
    const carried = await pool.query<{ id: string; count: number }>(
      `SELECT item.id, item.count FROM items item
       JOIN items backpack ON backpack.id = item.container_id
       WHERE backpack.character_id = $1
         AND backpack.equipment_slot = 'backpack'
         AND item.item_type_id = $2`,
      [characterId, GOLD_COIN_TYPE],
    );
    expect(carried.rows).toEqual([{ id: carriedItemId, count: 50 }]);
    const delivery = await pool.query<{
      item_id: string | null;
      status: string;
    }>(
      `SELECT item_id, status FROM inbox_deliveries
       WHERE delivery_key = $1`,
      [deliveryKey],
    );
    expect(delivery.rows[0]).toEqual({ item_id: null, status: "claimed" });
    expect(await auditCount("inbox-claim", "item-merged")).toBe(1);
  });

  it("delivers one offline reward when the same delivery is retried", async () => {
    const recipientCharacterId = await createCharacter("Recipient");

    const results = await Promise.all([
      store.deliverReward({
        deliveryKey: "reward:quest-100:recipient",
        recipientCharacterId,
        itemTypeId: AXE_TYPE,
        count: 1,
      }),
      store.deliverReward({
        deliveryKey: "reward:quest-100:recipient",
        recipientCharacterId,
        itemTypeId: AXE_TYPE,
        count: 1,
      }),
    ]);

    expect(new Set(results.map((result) => result.itemId)).size).toBe(1);
    expect(results.filter((result) => result.idempotent)).toHaveLength(1);
    const inbox = await pool.query<{ id: string }>(
      `SELECT id FROM items
       WHERE character_id = $1 AND location_type = 'inbox'`,
      [recipientCharacterId],
    );
    expect(inbox.rows).toHaveLength(1);
    const deliveries = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM inbox_deliveries
       WHERE delivery_key = 'reward:quest-100:recipient'`,
    );
    expect(deliveries.rows[0]?.count).toBe("1");
    expect(await auditCount("reward-delivery", "item-created")).toBe(1);
  });

  it("returns expired offline mail to its original owner", async () => {
    const senderCharacterId = await createCharacter("Sender");
    const recipientCharacterId = await createCharacter("Receiver");
    const itemId = await insertBackpackItem(
      senderCharacterId,
      AXE_TYPE,
      1,
      0,
    );
    const now = new Date("2026-07-18T00:00:00.000Z");
    const sent = await store.sendMail({
      deliveryKey: "mail:sender:expired",
      senderCharacterId,
      itemId,
      itemRevision: 1,
      normalizedRecipientName: "depot receiver",
      expiresAt: new Date("2026-07-17T00:00:00.000Z"),
    });
    expect(sent.status).toBe("committed");

    const returned = await store.returnExpired(now, 25);

    expect(returned).toEqual([
      { itemId, recipientCharacterId, returnCharacterId: senderCharacterId },
    ]);
    const item = await pool.query<{
      character_id: string;
      location_type: string;
    }>("SELECT character_id, location_type FROM items WHERE id = $1", [itemId]);
    expect(item.rows[0]).toEqual({
      character_id: senderCharacterId,
      location_type: "inbox",
    });
    const delivery = await pool.query<{ status: string }>(
      "SELECT status FROM inbox_deliveries WHERE delivery_key = $1",
      ["mail:sender:expired"],
    );
    expect(delivery.rows[0]?.status).toBe("returned");
    expect(await auditCount("mail-delivery")).toBe(1);
    expect(await auditCount("inbox-return")).toBe(1);
  });

  it("stows and retrieves a pinned non-stackable Canary ware", async () => {
    const characterId = await createCharacter("Stash");
    const itemId = await insertBackpackItem(
      characterId,
      AXE_TYPE,
      1,
      0,
    );
    const initial = await store.browse(
      characterId,
      DEPOT_ID,
      "stash",
      1,
      null,
    );

    const deposited = await store.depositStash(
      characterId,
      DEPOT_ID,
      initial.snapshot.stashRevision,
      itemId,
      1,
      1,
    );
    expect(deposited.status).toBe("committed");
    if (deposited.status !== "committed") return;
    expect(
      await pool.query("SELECT id FROM items WHERE id = $1", [itemId]),
    ).toMatchObject({ rowCount: 0 });

    const withdrawn = await store.withdrawStash(
      characterId,
      DEPOT_ID,
      deposited.snapshot.stashRevision,
      AXE_TYPE,
      1,
      400,
    );
    expect(withdrawn.status).toBe("committed");
    const stash = await pool.query(
      "SELECT count FROM supply_stash WHERE character_id = $1",
      [characterId],
    );
    expect(stash.rows).toEqual([]);
    const carried = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM items item
       JOIN items backpack ON backpack.id = item.container_id
       WHERE backpack.character_id = $1
         AND backpack.equipment_slot = 'backpack'
         AND item.item_type_id = $2`,
      [characterId, AXE_TYPE],
    );
    expect(carried.rows[0]?.count).toBe("1");
  });

  it("fills carried stacks before creating a stash-withdrawal remainder", async () => {
    const characterId = await createCharacter("Stash Merge");
    const carriedItemId = await insertBackpackItem(
      characterId,
      HEALTH_POTION_TYPE,
      80,
      0,
    );
    const stashedItemId = await insertBackpackItem(
      characterId,
      HEALTH_POTION_TYPE,
      30,
      1,
    );
    const initial = await store.browse(
      characterId,
      DEPOT_ID,
      "stash",
      1,
      null,
    );
    const deposited = await store.depositStash(
      characterId,
      DEPOT_ID,
      initial.snapshot.stashRevision,
      stashedItemId,
      1,
      30,
    );
    expect(deposited.status).toBe("committed");
    if (deposited.status !== "committed") return;

    const withdrawn = await store.withdrawStash(
      characterId,
      DEPOT_ID,
      deposited.snapshot.stashRevision,
      HEALTH_POTION_TYPE,
      30,
      400,
    );

    expect(withdrawn.status).toBe("committed");
    const carried = await pool.query<{ id: string; count: number }>(
      `SELECT item.id, item.count FROM items item
       JOIN items backpack ON backpack.id = item.container_id
       WHERE backpack.character_id = $1
         AND backpack.equipment_slot = 'backpack'
         AND item.item_type_id = $2`,
      [characterId, HEALTH_POTION_TYPE],
    );
    expect(carried.rows).toEqual(
      expect.arrayContaining([
        { id: carriedItemId, count: 100 },
        expect.objectContaining({ count: 10 }),
      ]),
    );
    expect(carried.rows).toHaveLength(2);
    expect(await auditCount("stash-withdrawal", "item-created")).toBe(2);
  });
});
