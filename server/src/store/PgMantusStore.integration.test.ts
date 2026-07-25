import { randomUUID } from "node:crypto";
import { DEPOT_LIMITS } from "@tibia/protocol";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
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

const itemOffer = () => {
  const offer = MANTUS_STORE_CATEGORIES.flatMap(
    (category) => category.offers,
  ).find((candidate) => candidate.item !== undefined);
  if (!offer) throw new Error("catalog has no item offer");
  return offer;
};

/** Leaves the inbox with no free slot for a delivery. */
const fillInbox = async (): Promise<void> => {
  await pool.query(
    "INSERT INTO character_storage_state (character_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [characterId],
  );
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, character_id, slot_index
     )
     SELECT gen_random_uuid(), 3031, 1, 'inbox', $1, slot
     FROM generate_series(0, $2) AS slot`,
    [characterId, DEPOT_LIMITS.maxInboxItems - 1],
  );
};

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
    await applyMigrations(setupClient);
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    store = new PgMantusStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM inbox_deliveries");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM character_storage_state");
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
         health, mana,
         position_x, position_y, position_z, direction,
         outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
         town_id
       ) VALUES (
         $1, $2, 'Store Hero', 'store hero', 'Knight',
         150, 50,
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
      requestId: randomUUID(),
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(0);
    expect(result.premiumUntil?.getTime() ?? 0).toBeGreaterThanOrEqual(
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
      result.premiumUntil?.toISOString(),
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
      store.purchase({
        accountId,
        characterId,
        offer,
        requestId: randomUUID(),
      }),
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
      store.purchase({
        accountId,
        characterId,
        offer,
        requestId: randomUUID(),
      }),
      store.purchase({
        accountId,
        characterId,
        offer,
        requestId: randomUUID(),
      }),
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

  it("delivers an item product to the inbox in the purchase's own transaction", async () => {
    const offer = itemOffer();

    const result = await store.purchase({
      accountId,
      characterId,
      offer,
      requestId: randomUUID(),
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(250 - offer.price);
    expect(result.deliveredItem?.typeId).toBe(offer.item?.itemTypeId);
    const delivered = await pool.query<{
      location_type: string;
      character_id: string;
      count: number;
    }>(
      "SELECT location_type, character_id, count FROM items WHERE id = $1",
      [result.deliveredItem?.id],
    );
    expect(delivered.rows[0]).toEqual({
      location_type: "inbox",
      character_id: characterId,
      count: offer.item?.count,
    });
    // Premium is untouched by an item offer.
    const account = await pool.query<{ premium_until: Date | null }>(
      "SELECT premium_until FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.premium_until).toBeNull();
  });

  it("rolls the coin debit back when the inbox cannot take the product", async () => {
    await fillInbox();

    const result = await store.purchase({
      accountId,
      characterId,
      offer: itemOffer(),
      requestId: randomUUID(),
    });

    expect(result).toEqual({ status: "inbox-full" });
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe("250");
    expect(
      await pool.query("SELECT id FROM mantus_coin_ledger"),
    ).toHaveProperty("rowCount", 0);
  });

  it("cannot double-charge or double-deliver a replayed purchase", async () => {
    const offer = itemOffer();
    const requestId = randomUUID();

    const first = await store.purchase({
      accountId,
      characterId,
      offer,
      requestId,
    });
    const replay = await store.purchase({
      accountId,
      characterId,
      offer,
      requestId,
    });

    expect(first.status).toBe("committed");
    expect(replay.status).toBe("committed");
    if (replay.status !== "committed") return;
    expect(replay.deliveredItem).toBeNull();
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe(String(250 - offer.price));
    expect(
      await pool.query("SELECT id FROM mantus_coin_ledger"),
    ).toHaveProperty("rowCount", 1);
    expect(
      await pool.query("SELECT id FROM items WHERE location_type = 'inbox'"),
    ).toHaveProperty("rowCount", 1);
  });

  it("grants coins once per grant key and audits the operator", async () => {
    const grantKey = randomUUID();

    const first = await store.grant({
      accountId,
      amount: 500,
      grantKey,
      operatorCharacterId: characterId,
    });
    const replay = await store.grant({
      accountId,
      amount: 500,
      grantKey,
      operatorCharacterId: characterId,
    });

    expect(first).toEqual({ status: "committed", balance: 750 });
    expect(replay).toEqual({ status: "committed", balance: 750 });
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe("750");
    const ledger = await pool.query<{ entry_type: string; amount: string }>(
      "SELECT entry_type, amount FROM mantus_coin_ledger",
    );
    expect(ledger.rows).toEqual([{ entry_type: "grant", amount: "500" }]);
    const audit = await pool.query<{ event_type: string }>(
      "SELECT event_type FROM audit_log WHERE event_type = 'store-grant'",
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("refunds a purchase exactly once", async () => {
    const offer = MANTUS_STORE_CATEGORIES[0]!.offers[0]!;
    await store.purchase({
      accountId,
      characterId,
      offer,
      requestId: randomUUID(),
    });
    const entry = await pool.query<{ id: string }>(
      "SELECT id FROM mantus_coin_ledger WHERE entry_type = 'purchase'",
    );
    const ledgerEntryId = entry.rows[0]?.id;
    if (!ledgerEntryId) throw new Error("purchase ledger row is missing");

    const first = await store.refund({
      ledgerEntryId,
      operatorCharacterId: characterId,
    });
    const second = await store.refund({
      ledgerEntryId,
      operatorCharacterId: characterId,
    });

    expect(first).toEqual({ status: "committed", balance: 250 });
    expect(second).toEqual({ status: "already-refunded" });
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe("250");
    expect(
      await pool.query(
        "SELECT id FROM mantus_coin_ledger WHERE entry_type = 'refund'",
      ),
    ).toHaveProperty("rowCount", 1);
  });

  it("serves the account's own coin history newest first", async () => {
    await store.grant({
      accountId,
      amount: 100,
      grantKey: randomUUID(),
      operatorCharacterId: characterId,
    });
    await store.purchase({
      accountId,
      characterId,
      offer: itemOffer(),
      requestId: randomUUID(),
    });

    const history = await store.history(accountId, 50);

    expect(history.map((entry) => entry.entryType)).toEqual([
      "purchase",
      "grant",
    ]);
    expect(history[0]?.amount).toBeLessThan(0);
    expect(history[1]).toMatchObject({ amount: 100, balanceAfter: 350 });
  });
});
