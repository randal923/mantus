import { randomUUID } from "node:crypto";
import { GOLD_COIN_TYPE_ID, PLATINUM_COIN_TYPE_ID } from "@tibia/protocol";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgItemPersistOps } from "../item/PgItemPersistOps";
import { PgItemStore } from "../item/PgItemStore";
import { applyMigrations } from "../test/applyMigrations";
import { PgBankStore } from "./PgBankStore";
import { PgEconomyPersistOps } from "./PgEconomyPersistOps";
import { planBankDeposit } from "./plan/planBankDeposit";
import { planBankWithdraw } from "./plan/planBankWithdraw";
import { planShopPurchase } from "./plan/planShopPurchase";
import { planShopSale } from "./plan/planShopSale";

const TEST_SCHEMA = "economy_persist_integration";
const MIGRATION_LOCK_KEY = 7_281_006;
const AXE_TYPE = 3274;
const BACKPACK_TYPE = 2854;
const MAP_NAME = "economy-test";
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let catalog: ItemCatalog;
let itemStore: PgItemStore;
let bankStore: PgBankStore;
let economyPersist: PgEconomyPersistOps;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const insertBackpackItem = async (
  characterId: string,
  typeId: number,
  count: number,
  slot: number,
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, attributes, location_type, container_id,
       slot_index
     )
     SELECT $1, $2, $3, '{}'::jsonb, 'container', id, $5
     FROM items
     WHERE character_id = $4 AND location_type = 'equipment'
       AND equipment_slot = 'backpack'`,
    [id, typeId, count, characterId, slot],
  );
  return id;
};

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`economy-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Shopper ${label}`,
    vocation: "Knight",
    sex: "male",
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
  await pool.query("DELETE FROM audit_log WHERE character_id = $1", [
    summary.id,
  ]);
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

const itemAmount = async (
  characterId: string,
  itemTypeId: number,
): Promise<number> => {
  const result = await pool.query<{ amount: string }>(
    `WITH RECURSIVE owned AS (
       SELECT id, item_type_id, count, container_id
       FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
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

const auditDetails = async (
  eventType: string,
): Promise<ReadonlyArray<Record<string, unknown>>> => {
  const result = await pool.query<{ details: Record<string, unknown> }>(
    "SELECT details FROM audit_log WHERE event_type = $1 ORDER BY created_at",
    [eventType],
  );
  return result.rows.map((row) => row.details);
};

const ledgerRows = async (): Promise<
  ReadonlyArray<{ entry_type: string; amount: string; balance_after: string }>
> => {
  const result = await pool.query<{
    entry_type: string;
    amount: string;
    balance_after: string;
  }>(
    "SELECT entry_type, amount, balance_after FROM bank_ledger ORDER BY created_at",
  );
  return result.rows;
};

/** Loads live state, plans the trade, and commits it — the production path. */
const carriedOf = async (characterId: string) => ({
  items: await itemStore.loadForCharacter(characterId),
  capacityMax: 100_000,
  bankBalance: await bankStore.balance(characterId),
});

const offer = {
  npcTypeId: "sam",
  shopId: "sam",
  offerId: "item-3274",
  itemTypeId: AXE_TYPE,
};

databaseDescribe("PgEconomyPersistOps integration", () => {
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
    catalog = await loadItemCatalog();
    itemStore = new PgItemStore(pool, catalog, MAP_NAME);
    bankStore = new PgBankStore(pool);
    economyPersist = new PgEconomyPersistOps(
      pool,
      new PgItemPersistOps(pool, MAP_NAME),
    );
    characterStore = new PgCharacterStore(pool);
    characterService = new CharacterService(characterStore, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    });
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool.end();
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM shop_stock");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    characterId = await createCharacter("a");
  });

  it("commits a purchase's goods, coins and audit in one transaction", async () => {
    await insertBackpackItem(characterId, GOLD_COIN_TYPE_ID, 100, 0);

    const plan = planShopPurchase({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      ...offer,
      amount: 2,
      unitPrice: 20,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    await economyPersist.persist(plan.persist);

    expect(await itemAmount(characterId, AXE_TYPE)).toBe(2);
    expect(await itemAmount(characterId, GOLD_COIN_TYPE_ID)).toBe(60);
    expect(await auditDetails("shop-purchase")).toEqual([
      expect.objectContaining({ amount: 2, totalCost: 40, bankSpent: 0 }),
    ]);
  });

  it("debits the bank for the shortfall and writes its ledger row", async () => {
    await insertBackpackItem(characterId, GOLD_COIN_TYPE_ID, 10, 0);
    await setBalance(characterId, 1_000);

    const plan = planShopPurchase({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      ...offer,
      amount: 1,
      unitPrice: 20,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    await economyPersist.persist(plan.persist);

    expect(await bankStore.balance(characterId)).toBe(990);
    expect(await itemAmount(characterId, GOLD_COIN_TYPE_ID)).toBe(0);
    expect(await ledgerRows()).toEqual([
      { entry_type: "shop-purchase", amount: "10", balance_after: "990" },
    ]);
  });

  it("refuses to write a bank leg the database disagrees with", async () => {
    await setBalance(characterId, 1_000);
    const plan = planShopPurchase({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      ...offer,
      amount: 1,
      unitPrice: 20,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    // Someone else spent the money between planning and the write.
    await setBalance(characterId, 5);

    await expect(economyPersist.persist(plan.persist)).rejects.toThrow(
      /bank balance diverged/,
    );
    expect(await bankStore.balance(characterId)).toBe(5);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(0);
  });

  it("never lets a bank debit drive the balance negative", async () => {
    await setBalance(characterId, 30);

    const plan = planShopPurchase({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      ...offer,
      amount: 1,
      unitPrice: 20,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    await economyPersist.persist(plan.persist);
    expect(await bankStore.balance(characterId)).toBe(10);

    // A second purchase planned from the same stale snapshot must not commit.
    const stale = planShopPurchase({
      characterId,
      catalog,
      carried: { items: [], capacityMax: 100_000, bankBalance: 30 },
      ...offer,
      amount: 1,
      unitPrice: 20,
    });
    expect(stale.status).toBe("planned");
    if (stale.status !== "planned") return;
    await expect(economyPersist.persist(stale.persist)).rejects.toThrow();
    expect(await bankStore.balance(characterId)).toBe(10);
  });

  it("decrements finite stock under a guard and rejects a stale count", async () => {
    await insertBackpackItem(characterId, GOLD_COIN_TYPE_ID, 100, 0);
    await pool.query(
      `INSERT INTO shop_stock (shop_id, offer_id, initial_stock, remaining_stock)
       VALUES ($1, $2, 10, 10)`,
      [offer.shopId, offer.offerId],
    );

    const plan = planShopPurchase({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      ...offer,
      amount: 3,
      unitPrice: 1,
      stock: { initial: 10, remaining: 10 },
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    await economyPersist.persist(plan.persist);

    const remaining = await pool.query<{ remaining_stock: number }>(
      "SELECT remaining_stock FROM shop_stock WHERE shop_id = $1 AND offer_id = $2",
      [offer.shopId, offer.offerId],
    );
    expect(remaining.rows[0]?.remaining_stock).toBe(7);

    // Replaying the same plan would oversell; the guard catches the mismatch.
    await expect(economyPersist.persist(plan.persist)).rejects.toThrow(
      /shop stock diverged/,
    );
  });

  it("banks sale proceeds that will not fit and audits both legs", async () => {
    // Fill the backpack so the proceeds have nowhere to go but the bank.
    for (let slot = 0; slot < 19; slot++) {
      await insertBackpackItem(characterId, AXE_TYPE, 1, slot + 1);
    }
    await insertBackpackItem(characterId, AXE_TYPE, 1, 0);
    await setBalance(characterId, 500);

    const plan = planShopSale({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      ...offer,
      amount: 1,
      unitPrice: 25_000,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    expect(plan.bankCredited).toBeGreaterThan(0);
    await economyPersist.persist(plan.persist);

    expect(await bankStore.balance(characterId)).toBe(500 + plan.bankCredited);
    expect(await auditDetails("shop-sale")).toEqual([
      expect.objectContaining({
        amount: 1,
        totalProceeds: 25_000,
        bankCredited: plan.bankCredited,
      }),
    ]);
    expect(await ledgerRows()).toEqual([
      expect.objectContaining({ entry_type: "shop-sale" }),
    ]);
  });

  it("commits a deposit's burnt coins and credited balance together", async () => {
    await insertBackpackItem(characterId, GOLD_COIN_TYPE_ID, 100, 0);

    const plan = planBankDeposit({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      amount: 60,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    await economyPersist.persist(plan.persist);

    expect(await bankStore.balance(characterId)).toBe(60);
    expect(await itemAmount(characterId, GOLD_COIN_TYPE_ID)).toBe(40);
    expect(await ledgerRows()).toEqual([
      { entry_type: "deposit", amount: "60", balance_after: "60" },
    ]);
  });

  it("commits a withdrawal's minted coins and debited balance together", async () => {
    await setBalance(characterId, 1_000);

    const plan = planBankWithdraw({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      amount: 250,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    await economyPersist.persist(plan.persist);

    expect(await bankStore.balance(characterId)).toBe(750);
    expect(await itemAmount(characterId, PLATINUM_COIN_TYPE_ID)).toBe(2);
    expect(await itemAmount(characterId, GOLD_COIN_TYPE_ID)).toBe(50);
    expect(await ledgerRows()).toEqual([
      { entry_type: "withdraw", amount: "250", balance_after: "750" },
    ]);
  });

  it("creates the bank row for a character who has never banked", async () => {
    await insertBackpackItem(characterId, GOLD_COIN_TYPE_ID, 100, 0);

    const plan = planBankDeposit({
      characterId,
      catalog,
      carried: await carriedOf(characterId),
      amount: 25,
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    await economyPersist.persist(plan.persist);

    expect(await bankStore.balance(characterId)).toBe(25);
  });

  it("leaves exactly one purchase when two race for the same coins", async () => {
    await insertBackpackItem(characterId, GOLD_COIN_TYPE_ID, 20, 0);
    const carried = await carriedOf(characterId);
    const plans = [1, 2].map(() =>
      planShopPurchase({
        characterId,
        catalog,
        carried,
        ...offer,
        amount: 1,
        unitPrice: 20,
      }),
    );

    const settled = await Promise.allSettled(
      plans.map((plan) =>
        plan.status === "planned"
          ? economyPersist.persist(plan.persist)
          : Promise.reject(new Error(plan.status)),
      ),
    );

    // Both plans delete the same coin row; the version guard lets one win.
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(await itemAmount(characterId, GOLD_COIN_TYPE_ID)).toBe(0);
    expect(await itemAmount(characterId, AXE_TYPE)).toBe(1);
  });
});
