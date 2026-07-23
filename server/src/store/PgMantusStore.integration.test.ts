import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { MANTUS_STORE_CATEGORIES } from "./MANTUS_STORE_CATEGORIES";
import { PgMantusStore } from "./PgMantusStore";

const TEST_SCHEMA = "mantus_store_integration";
const MIGRATION_LOCK_KEY = 7_281_033;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgMantusStore;
let accountId: string;
let characterId: string;

databaseDescribe("PgMantusStore integration", () => {
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
      "024_account_premium.sql",
      "033_mantus_store.sql",
    ]) {
      await setupClient.query(
        await readFile(`${migrationsDirectory}${migration}`, "utf8"),
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    store = new PgMantusStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM mantus_coin_ledger");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language, mantus_coins)
       VALUES ($1, 'en', 250)
       RETURNING id`,
      [`store-${randomUUID()}`],
    );
    const createdAccountId = account.rows[0]?.id;
    if (!createdAccountId) throw new Error("account insert returned no id");
    accountId = createdAccountId;
    characterId = randomUUID();
    await pool.query(
      `INSERT INTO characters (
         id, account_id, display_name, normalized_name, vocation,
         health, max_health, mana, max_mana, capacity,
         position_x, position_y, position_z, direction,
         outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
         town_id
       ) VALUES (
         $1, $2, 'Store Hero', 'store hero', 'Knight',
         150, 150, 50, 50, 400,
         100, 100, 7, 'south',
         128, 1, 1, 1, 1,
         1
       )`,
      [characterId, accountId],
    );
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

  it("atomically debits coins, extends premium, and writes both ledgers", async () => {
    const offer = MANTUS_STORE_CATEGORIES[0]!.offers[0]!;
    const before = Date.now();

    const result = await store.purchase({
      accountId,
      characterId,
      offer,
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(0);
    expect(result.premiumUntil.getTime()).toBeGreaterThanOrEqual(
      before + 30 * 24 * 60 * 60 * 1_000,
    );
    const account = await pool.query<{
      mantus_coins: string;
      premium_until: Date;
    }>(
      "SELECT mantus_coins, premium_until FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe("0");
    expect(account.rows[0]?.premium_until.toISOString()).toBe(
      result.premiumUntil.toISOString(),
    );
    const ledger = await pool.query<{
      entry_type: string;
      amount: string;
      balance_after: string;
      offer_id: string;
    }>(
      `SELECT entry_type, amount, balance_after, offer_id
       FROM mantus_coin_ledger WHERE account_id = $1`,
      [accountId],
    );
    expect(ledger.rows).toEqual([
      {
        entry_type: "purchase",
        amount: "-250",
        balance_after: "0",
        offer_id: "premium-30",
      },
    ]);
    const audit = await pool.query<{ event_type: string; details: unknown }>(
      `SELECT event_type, details FROM audit_log
       WHERE character_id = $1`,
      [characterId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      event_type: "store-purchase",
      details: {
        accountId,
        offerId: "premium-30",
        price: 250,
        balanceAfter: 0,
      },
    });
  });

  it("does not charge or grant premium when coins are insufficient", async () => {
    await pool.query(
      "UPDATE accounts SET mantus_coins = 249 WHERE id = $1",
      [accountId],
    );
    const offer = MANTUS_STORE_CATEGORIES[0]!.offers[0]!;

    await expect(
      store.purchase({ accountId, characterId, offer }),
    ).resolves.toEqual({ status: "insufficient-coins" });

    const account = await pool.query<{
      mantus_coins: string;
      premium_until: Date | null;
    }>(
      "SELECT mantus_coins, premium_until FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]).toEqual({
      mantus_coins: "249",
      premium_until: null,
    });
    expect(
      await pool.query("SELECT id FROM mantus_coin_ledger"),
    ).toHaveProperty("rowCount", 0);
    expect(await pool.query("SELECT id FROM audit_log")).toHaveProperty(
      "rowCount",
      0,
    );
  });

  it("serializes racing purchases so one balance can only be spent once", async () => {
    const offer = MANTUS_STORE_CATEGORIES[0]!.offers[0]!;

    const results = await Promise.all([
      store.purchase({ accountId, characterId, offer }),
      store.purchase({ accountId, characterId, offer }),
    ]);

    expect(results.filter((result) => result.status === "committed")).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.status === "insufficient-coins"))
      .toHaveLength(1);
    const account = await pool.query<{
      mantus_coins: string;
      premium_until: Date | null;
    }>(
      "SELECT mantus_coins, premium_until FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe("0");
    expect(account.rows[0]?.premium_until).not.toBeNull();
    expect(
      await pool.query("SELECT id FROM mantus_coin_ledger"),
    ).toHaveProperty("rowCount", 1);
    expect(await pool.query("SELECT id FROM audit_log")).toHaveProperty(
      "rowCount",
      1,
    );
  });
});
