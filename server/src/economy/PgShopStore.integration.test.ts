import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import type { ShopPurchaseRequest, ShopSaleRequest } from "./ShopStore";
import { PgShopStore } from "./PgShopStore";

const TEST_SCHEMA = "shop_store_integration";
const MIGRATION_LOCK_KEY = 7_281_005;
const GOLD_TYPE = 3031;
const PLATINUM_TYPE = 3035;
const CRYSTAL_TYPE = 3043;
const AXE_TYPE = 3274;
const HELMET_TYPE = 3355;
const BACKPACK_TYPE = 2854;
const EXERCISE_SWORD_TYPE = 28552;
const SILVER_TOKEN_TYPE = 22516;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgShopStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const insertInventoryItem = async (
  characterId: string,
  typeId: number,
  count: number,
  slot: number,
  attributes: Readonly<Record<string, unknown>> = {},
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, attributes, location_type, character_id,
       slot_index
     ) VALUES ($1, $2, $3, $4::jsonb, 'inventory', $5, $6)`,
    [id, typeId, count, JSON.stringify(attributes), characterId, slot],
  );
  return id;
};

const insertEquipmentItem = async (
  characterId: string,
  typeId: number,
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, location_type, character_id, equipment_slot
     ) VALUES ($1, $2, 'equipment', $3, 'weapon')`,
    [id, typeId, characterId],
  );
  return id;
};

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`shop-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Shopper ${label}`,
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
  await pool.query("DELETE FROM audit_log WHERE character_id = $1", [summary.id]);
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, location_type, character_id, equipment_slot
     ) VALUES ($1, $2, 'equipment', $3, 'backpack')`,
    [randomUUID(), BACKPACK_TYPE, summary.id],
  );
  return summary.id;
};

const setBalance = async (
  characterId: string,
  balance: number,
): Promise<void> => {
  await pool.query(
    `INSERT INTO bank_accounts (character_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO UPDATE SET balance = $2`,
    [characterId, balance],
  );
};

const balance = async (characterId: string): Promise<number> => {
  const result = await pool.query<{ balance: string }>(
    "SELECT balance FROM bank_accounts WHERE character_id = $1",
    [characterId],
  );
  return Number(result.rows[0]?.balance ?? 0);
};

const itemAmount = async (
  characterId: string,
  itemTypeId: number,
): Promise<number> => {
  const result = await pool.query<{ amount: string }>(
    `WITH RECURSIVE owned AS (
       SELECT id, item_type_id, count, container_id
       FROM items
       WHERE character_id = $1
         AND location_type IN ('equipment', 'inventory')
       UNION ALL
       SELECT child.id, child.item_type_id, child.count, child.container_id
       FROM items child JOIN owned ON child.container_id = owned.id
     )
     SELECT COALESCE(SUM(count), 0)::text AS amount
     FROM owned WHERE item_type_id = $2`,
    [characterId, itemTypeId],
  );
  return Number(result.rows[0]?.amount ?? 0);
};

const auditCount = async (eventType: string): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_log WHERE event_type = $1",
    [eventType],
  );
  return Number(result.rows[0]?.count ?? 0);
};

const purchaseRequest = (
  overrides: Partial<ShopPurchaseRequest> = {},
): ShopPurchaseRequest => ({
  npcTypeId: "sam",
  shopId: "sam",
  offerId: "item-3274",
  itemTypeId: AXE_TYPE,
  amount: 1,
  unitPrice: 20,
  totalCost: 20,
  stackable: false,
  maxCount: 1,
  ...overrides,
});

const saleRequest = (
  overrides: Partial<ShopSaleRequest> = {},
): ShopSaleRequest => ({
  npcTypeId: "sam",
  shopId: "sam",
  offerId: "item-3274",
  itemTypeId: AXE_TYPE,
  amount: 1,
  unitPrice: 7,
  totalProceeds: 7,
  ...overrides,
});

databaseDescribe("PgShopStore integration", () => {
  let characterId: string;

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
      "018_pvp.sql",
      "019_houses.sql",
      "020_social.sql",
      "021_moderation.sql",
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
    store = new PgShopStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM shop_stock");
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    characterId = await createCharacter("alpha");
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

  it("commits carried money, bank money, purchased items, ledger, and audit atomically", async () => {
    await insertInventoryItem(characterId, PLATINUM_TYPE, 1, 0);
    await setBalance(characterId, 50);

    const result = await store.purchase(
      characterId,
      purchaseRequest({ amount: 3, unitPrice: 40, totalCost: 120 }),
    );

    expect(result.status).toBe("committed");
    expect(await itemAmount(characterId, PLATINUM_TYPE)).toBe(0);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(3);
    expect(await balance(characterId)).toBe(30);
    expect(await auditCount("shop-purchase")).toBe(1);
    expect(await auditCount("item-destroyed")).toBe(1);
    expect(await auditCount("item-created")).toBe(3);
    const ledger = await pool.query<{ amount: string; balance_after: string }>(
      `SELECT amount, balance_after FROM bank_ledger
       WHERE character_id = $1 AND entry_type = 'shop-purchase'`,
      [characterId],
    );
    expect(ledger.rows).toEqual([{ amount: "20", balance_after: "30" }]);
  });

  it("puts coin change and purchased items in the equipped backpack", async () => {
    const equipped = await pool.query<{ id: string }>(
      `SELECT id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'`,
      [characterId],
    );
    const backpackId = equipped.rows[0]?.id;
    if (!backpackId) throw new Error("test backpack is missing");
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, container_id, slot_index
       ) VALUES ($1, $2, 1, 'container', $3, 0)`,
      [randomUUID(), PLATINUM_TYPE, backpackId],
    );
    await insertInventoryItem(characterId, GOLD_TYPE, 14, 0);

    const result = await store.purchase(
      characterId,
      purchaseRequest({ unitPrice: 20, totalCost: 20 }),
    );

    expect(result.status).toBe("committed");
    const rootItems = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM items
       WHERE character_id = $1 AND location_type = 'inventory'`,
      [characterId],
    );
    expect(rootItems.rows[0]?.count).toBe("0");
    const backpackItems = await pool.query<{
      item_type_id: number;
      count: number;
      slot_index: number;
    }>(
      `SELECT item_type_id, count, slot_index FROM items
       WHERE container_id = $1 AND location_type = 'container'
       ORDER BY slot_index`,
      [backpackId],
    );
    expect(backpackItems.rows).toEqual([
      { item_type_id: GOLD_TYPE, count: 94, slot_index: 0 },
      { item_type_id: AXE_TYPE, count: 1, slot_index: 1 },
    ]);
  });

  it("changes nothing when carried and bank funds are insufficient", async () => {
    await insertInventoryItem(characterId, GOLD_TYPE, 10, 0);
    await setBalance(characterId, 5);

    const result = await store.purchase(characterId, purchaseRequest());

    expect(result.status).toBe("insufficient-funds");
    expect(await itemAmount(characterId, GOLD_TYPE)).toBe(10);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(0);
    expect(await balance(characterId)).toBe(5);
    expect(await auditCount("shop-purchase")).toBe(0);
    expect(await auditCount("item-destroyed")).toBe(0);
  });

  it("atomically spends a custom item currency without touching gold or bank", async () => {
    await insertInventoryItem(characterId, SILVER_TOKEN_TYPE, 10, 0);
    await setBalance(characterId, 500);

    const result = await store.purchase(
      characterId,
      purchaseRequest({
        amount: 2,
        unitPrice: 3,
        totalCost: 6,
        currencyItemTypeId: SILVER_TOKEN_TYPE,
        currencyMaxCount: 100,
      }),
    );

    expect(result.status).toBe("committed");
    expect(await itemAmount(characterId, SILVER_TOKEN_TYPE)).toBe(4);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(2);
    expect(await balance(characterId)).toBe(500);
    expect(await auditCount("shop-purchase")).toBe(1);
  });

  it("preserves and audits Canary's zero-cost shop purchase", async () => {
    const result = await store.purchase(
      characterId,
      purchaseRequest({ unitPrice: 0, totalCost: 0 }),
    );

    expect(result.status).toBe("committed");
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(1);
    expect(await auditCount("shop-purchase")).toBe(1);
    expect(await auditCount("item-created")).toBe(1);
  });

  it("rolls back partial payment and grants when a purchase cannot fit", async () => {
    await insertInventoryItem(characterId, GOLD_TYPE, 100, 0);
    for (let slot = 1; slot < 100; slot++) {
      await insertInventoryItem(characterId, HELMET_TYPE, 1, slot);
    }

    const result = await store.purchase(
      characterId,
      purchaseRequest({ amount: 2, unitPrice: 50, totalCost: 100 }),
    );

    expect(result.status).toBe("no-space");
    expect(await itemAmount(characterId, GOLD_TYPE)).toBe(100);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(0);
    expect(await auditCount("item-destroyed")).toBe(0);
    expect(await auditCount("item-created")).toBe(0);
  });

  it("persists server-owned charged-item subtypes", async () => {
    await setBalance(characterId, 347_222);

    const result = await store.purchase(
      characterId,
      purchaseRequest({
        offerId: "item-28552-500",
        itemTypeId: EXERCISE_SWORD_TYPE,
        unitPrice: 347_222,
        totalCost: 347_222,
        subtype: { kind: "charges", value: 500 },
      }),
    );

    expect(result.status).toBe("committed");
    const item = await pool.query<{ attributes: Record<string, unknown> }>(
      `WITH RECURSIVE owned AS (
         SELECT id, item_type_id, attributes FROM items
         WHERE character_id = $1
         UNION ALL
         SELECT child.id, child.item_type_id, child.attributes
         FROM items child JOIN owned ON child.container_id = owned.id
       )
       SELECT attributes FROM owned WHERE item_type_id = $2`,
      [characterId, EXERCISE_SWORD_TYPE],
    );
    expect(item.rows).toEqual([{ attributes: { charges: 500 } }]);
  });

  it("sells only owned, unequipped items and commits proceeds with audits", async () => {
    await insertEquipmentItem(characterId, AXE_TYPE);
    await insertInventoryItem(characterId, AXE_TYPE, 1, 0);
    await insertInventoryItem(characterId, AXE_TYPE, 1, 1);

    const result = await store.sell(
      characterId,
      saleRequest({ amount: 2, totalProceeds: 14 }),
    );

    expect(result.status).toBe("committed");
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(1);
    expect(await itemAmount(characterId, GOLD_TYPE)).toBe(14);
    expect(await auditCount("shop-sale")).toBe(1);
    expect(await auditCount("item-destroyed")).toBe(2);
    expect(await auditCount("item-created")).toBe(1);
  });

  it("does not sell a non-empty container", async () => {
    const containerId = await insertInventoryItem(
      characterId,
      AXE_TYPE,
      1,
      0,
    );
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, container_id, slot_index
       ) VALUES ($1, $2, 'container', $3, 0)`,
      [randomUUID(), HELMET_TYPE, containerId],
    );

    const result = await store.sell(characterId, saleRequest());

    expect(result.status).toBe("not-owned");
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(1);
    expect(await itemAmount(characterId, HELMET_TYPE)).toBe(1);
    expect(await auditCount("shop-sale")).toBe(0);
  });

  it("rolls back a sale when all proceeds cannot fit", async () => {
    await insertInventoryItem(characterId, AXE_TYPE, 1, 0);
    for (let slot = 1; slot < 100; slot++) {
      await insertInventoryItem(characterId, HELMET_TYPE, 1, slot);
    }

    const result = await store.sell(
      characterId,
      saleRequest({ unitPrice: 10_101, totalProceeds: 10_101 }),
    );

    expect(result.status).toBe("no-space");
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(1);
    expect(await itemAmount(characterId, GOLD_TYPE)).toBe(0);
    expect(await itemAmount(characterId, PLATINUM_TYPE)).toBe(0);
    expect(await itemAmount(characterId, CRYSTAL_TYPE)).toBe(0);
    expect(await auditCount("item-destroyed")).toBe(0);
    expect(await auditCount("item-created")).toBe(0);
  });

  it("lets exactly one racing purchase spend one bank balance", async () => {
    await setBalance(characterId, 100);
    const request = purchaseRequest({ unitPrice: 100, totalCost: 100 });

    const outcomes = await Promise.allSettled([
      store.purchase(characterId, request),
      store.purchase(characterId, request),
    ]);

    expect(
      outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" && outcome.value.status === "committed",
      ),
    ).toHaveLength(1);
    expect(await balance(characterId)).toBe(0);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(1);
    expect(await auditCount("shop-purchase")).toBe(1);
  });

  it("lets exactly one of two characters consume one stock unit", async () => {
    const secondCharacterId = await createCharacter("beta");
    await setBalance(characterId, 1);
    await setBalance(secondCharacterId, 1);
    const request = purchaseRequest({
      unitPrice: 1,
      totalCost: 1,
      stock: 1,
    });

    const outcomes = await Promise.allSettled([
      store.purchase(characterId, request),
      store.purchase(secondCharacterId, request),
    ]);

    expect(
      outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" && outcome.value.status === "committed",
      ),
    ).toHaveLength(1);
    expect(
      (await itemAmount(characterId, AXE_TYPE)) +
        (await itemAmount(secondCharacterId, AXE_TYPE)),
    ).toBe(1);
    const stock = await pool.query<{ remaining_stock: number }>(
      "SELECT remaining_stock FROM shop_stock WHERE shop_id = 'sam' AND offer_id = 'item-3274'",
    );
    expect(stock.rows).toEqual([{ remaining_stock: 0 }]);
    expect(await auditCount("shop-purchase")).toBe(1);
  });

  it("lets exactly one racing sale consume the same item", async () => {
    await insertInventoryItem(characterId, AXE_TYPE, 1, 0);

    const outcomes = await Promise.allSettled([
      store.sell(characterId, saleRequest()),
      store.sell(characterId, saleRequest()),
    ]);

    expect(
      outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" && outcome.value.status === "committed",
      ),
    ).toHaveLength(1);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(0);
    expect(await itemAmount(characterId, GOLD_TYPE)).toBe(7);
    expect(await auditCount("shop-sale")).toBe(1);
  });

  it("rolls back money, stock, items, and ledger when the shop audit fails", async () => {
    await setBalance(characterId, 20);
    await pool.query(
      `CREATE FUNCTION fail_shop_audit() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.event_type = 'shop-purchase' THEN
           RAISE EXCEPTION 'forced shop audit failure';
         END IF;
         RETURN NEW;
       END
       $$`,
    );
    await pool.query(
      `CREATE TRIGGER fail_shop_audit
       BEFORE INSERT ON audit_log
       FOR EACH ROW EXECUTE FUNCTION fail_shop_audit()`,
    );

    await expect(
      store.purchase(characterId, purchaseRequest({ stock: 1 })),
    ).rejects.toThrow("forced shop audit failure");

    await pool.query("DROP TRIGGER fail_shop_audit ON audit_log");
    await pool.query("DROP FUNCTION fail_shop_audit()");
    expect(await balance(characterId)).toBe(20);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(0);
    expect(await auditCount("item-created")).toBe(0);
    expect(await auditCount("shop-purchase")).toBe(0);
    expect(
      Number(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM bank_ledger",
          )
        ).rows[0]?.count ?? 0,
      ),
    ).toBe(0);
    expect(
      Number(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM shop_stock",
          )
        ).rows[0]?.count ?? 0,
      ),
    ).toBe(0);
  });
});
