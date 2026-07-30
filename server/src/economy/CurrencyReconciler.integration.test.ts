import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgItemPersistOps } from "../item/PgItemPersistOps";
import { PgItemStore } from "../item/PgItemStore";
import { applyMigrations } from "../test/applyMigrations";
import { CurrencyReconciler } from "./CurrencyReconciler";
import { PgBankStore } from "./PgBankStore";
import { PgEconomyPersistOps } from "./PgEconomyPersistOps";
import { planBankDeposit } from "./plan/planBankDeposit";
import { planBankWithdraw } from "./plan/planBankWithdraw";
import { planShopSale } from "./plan/planShopSale";

const TEST_SCHEMA = "currency_reconciler_integration";
const MIGRATION_LOCK_KEY = 7_281_019;
const GOLD_TYPE = 3031;
const AXE_TYPE = 3274;
const BACKPACK_TYPE = 2854;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let reconciler: CurrencyReconciler;
let bank: PgBankStore;
let catalog: ItemCatalog;
let itemStore: PgItemStore;
let economyPersist: PgEconomyPersistOps;
let characterId: string;

const backpackChild = async (
  typeId: number,
  count: number,
  slot: number,
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, container_id, slot_index
     )
     SELECT $1, $2, $3, 'container', id, $5
     FROM items
     WHERE character_id = $4 AND location_type = 'equipment'
       AND equipment_slot = 'backpack'`,
    [id, typeId, count, characterId, slot],
  );
  return id;
};

/** Seeds a balance the way a real deposit would: row plus its ledger entry. */
const seedBankBalance = async (amount: number): Promise<void> => {
  await pool.query(
    "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, $2)",
    [characterId, amount],
  );
  await pool.query(
    `INSERT INTO bank_ledger (character_id, entry_type, amount, balance_after)
     VALUES ($1, 'deposit', $2, $2)`,
    [characterId, amount],
  );
};

/** The live state a planner reads, loaded the way login does. */
const planInput = async () => ({
  characterId,
  catalog,
  carried: {
    items: await itemStore.loadForCharacter(characterId),
    capacityMax: 100_000,
    bankBalance: await bank.balance(characterId),
  },
});

const commit = async (plan: {
  status: string;
  persist?: Parameters<PgEconomyPersistOps["persist"]>[0];
}): Promise<void> => {
  expect(plan.status).toBe("planned");
  if (!plan.persist) throw new Error(`plan was rejected: ${plan.status}`);
  await economyPersist.persist(plan.persist);
};

databaseDescribe("CurrencyReconciler integration", () => {
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
    catalog = await loadItemCatalog();
    reconciler = new CurrencyReconciler(pool);
    bank = new PgBankStore(pool);
    itemStore = new PgItemStore(pool, catalog, "reconciler-test");
    economyPersist = new PgEconomyPersistOps(
      pool,
      new PgItemPersistOps(pool, "reconciler-test"),
    );
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ($1, 'en') RETURNING id`,
      [`reconciler-${randomUUID()}`],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error("account insert returned no id");
    const characters = new PgCharacterStore(pool);
    await new CharacterService(characters, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    }).create(accountId, {
      displayName: "Ledger Hero",
      vocation: "Knight",
      sex: "male",
    });
    const summary = (await characters.listByAccountId(accountId))[0];
    if (!summary) throw new Error("character was not created");
    characterId = summary.id;
    await pool.query(
      `WITH RECURSIVE owned AS (
         SELECT id FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id FROM items child JOIN owned ON child.container_id = owned.id
       )
       DELETE FROM items WHERE id IN (SELECT id FROM owned)`,
      [characterId],
    );
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, character_id, equipment_slot
       ) VALUES ($1, $2, 'equipment', $3, 'backpack')`,
      [randomUUID(), BACKPACK_TYPE, characterId],
    );
    // A fresh reconciler per test so the baseline sweep is deterministic.
    reconciler = new CurrencyReconciler(pool);
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

  it("reports the whole money supply and no delta on the first sweep", async () => {
    await backpackChild(GOLD_TYPE, 100, 0);
    await seedBankBalance(250);

    const report = await reconciler.run();

    expect(report.coins).toBe(100);
    expect(report.bank).toBe(250);
    expect(report.escrow).toBe(0);
    expect(report.total).toBe(350);
    // The baseline sweep has nothing to compare against.
    expect(report.unexplainedCoinDelta).toBeNull();
    expect(report.balanced).toBe(true);
  });

  it("reconciles a seeded run of real economy mutations to zero drift", async () => {
    await backpackChild(GOLD_TYPE, 100, 0);
    await backpackChild(AXE_TYPE, 1, 1);
    await reconciler.run();

    // Deposits and withdrawals move money between the two pots without
    // changing the supply; the sale mints new coins and audits them. Each runs
    // the production path: plan in memory, then commit the one transaction.
    await commit(planBankDeposit({ ...(await planInput()), amount: 60 }));
    await commit(planBankWithdraw({ ...(await planInput()), amount: 30 }));
    await commit(
      planShopSale({
        ...(await planInput()),
        npcTypeId: "sam",
        shopId: "sam",
        offerId: "item-3274",
        itemTypeId: AXE_TYPE,
        amount: 1,
        unitPrice: 7,
      }),
    );

    const report = await reconciler.run();

    expect(report.total).toBe(107);
    // Deposits burn coins, withdrawals mint them, the sale mints its proceeds:
    // -60 + 30 + 7 in the coin pot, all of it audited.
    expect(report.minted - report.burned).toBe(-23);
    expect(report.coins).toBe(77);
    expect(report.bank).toBe(30);
    expect(report.unexplainedCoinDelta).toBe(0);
    expect(report.balanced).toBe(true);
  });

  it("flags gold that appears with no audit trail", async () => {
    await reconciler.run();
    await backpackChild(GOLD_TYPE, 100, 0);

    const report = await reconciler.run();

    expect(report.unexplainedCoinDelta).toBe(100);
    expect(report.orphanCoinRows).toHaveLength(1);
    expect(report.orphanCoinRows[0]).toMatchObject({
      itemTypeId: GOLD_TYPE,
      count: 100,
    });
    expect(report.balanced).toBe(false);
  });

  it("flags a bank balance that moved without a ledger entry", async () => {
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 0)",
      [characterId],
    );
    await reconciler.run();
    await pool.query(
      "UPDATE bank_accounts SET balance = 9999 WHERE character_id = $1",
      [characterId],
    );

    const report = await reconciler.run();

    expect(report.bankLedgerDrift).toEqual([
      { characterId, balance: 9_999, ledgerBalance: 0 },
    ]);
    // The coin pot is untouched: a forged bank balance is caught by the
    // ledger checks, not by the coin delta.
    expect(report.unexplainedCoinDelta).toBe(0);
    expect(report.balanced).toBe(false);
  });

  it("flags a ledger row whose balance step does not match its amount", async () => {
    await seedBankBalance(500);
    // A forged entry: it claims to move 10 but the balance jumped by 400.
    await pool.query(
      `INSERT INTO bank_ledger (character_id, entry_type, amount, balance_after)
       VALUES ($1, 'deposit', 10, 900)`,
      [characterId],
    );
    await pool.query(
      "UPDATE bank_accounts SET balance = 900 WHERE character_id = $1",
      [characterId],
    );

    const report = await reconciler.run();

    // The balance still agrees with the latest entry, so only the chain
    // check can see this one.
    expect(report.bankLedgerDrift).toEqual([]);
    expect(report.bankLedgerBreaks).toHaveLength(1);
    expect(report.bankLedgerBreaks[0]).toMatchObject({
      characterId,
      amount: 10,
      balanceBefore: 500,
      balanceAfter: 900,
    });
    expect(report.balanced).toBe(false);
  });

  it("ignores ledger rows orphaned by character deletion", async () => {
    // Two characters bank the same amounts, then both are deleted: the FK
    // nulls their ledger rows, and the NULLs all land in one window
    // partition. Chaining those unrelated histories used to report false
    // breaks.
    await seedBankBalance(100);
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ($1, 'en') RETURNING id`,
      [`reconciler-${randomUUID()}`],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error("account insert returned no id");
    const characters = new PgCharacterStore(pool);
    await new CharacterService(characters, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    }).create(accountId, {
      displayName: "Ledger Hero II",
      vocation: "Knight",
      sex: "male",
    });
    const second = (await characters.listByAccountId(accountId))[0];
    if (!second) throw new Error("second character was not created");
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 100)",
      [second.id],
    );
    await pool.query(
      `INSERT INTO bank_ledger (character_id, entry_type, amount, balance_after)
       VALUES ($1, 'deposit', 100, 100)`,
      [second.id],
    );
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM characters");

    const report = await reconciler.run();

    expect(report.bankLedgerBreaks).toEqual([]);
    expect(report.bankLedgerDrift).toEqual([]);
    expect(report.balanced).toBe(true);
  });

  it("never mutates the data it reads", async () => {
    await backpackChild(GOLD_TYPE, 100, 0);
    await seedBankBalance(250);
    const before = await pool.query<{ count: string }>(
      `SELECT
         (SELECT count(*) FROM items)::text
         || ':' || (SELECT count(*) FROM audit_log)::text
         || ':' || (SELECT sum(balance) FROM bank_accounts)::text AS count`,
    );

    await reconciler.run();
    await reconciler.run();

    const after = await pool.query<{ count: string }>(
      `SELECT
         (SELECT count(*) FROM items)::text
         || ':' || (SELECT count(*) FROM audit_log)::text
         || ':' || (SELECT sum(balance) FROM bank_accounts)::text AS count`,
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
