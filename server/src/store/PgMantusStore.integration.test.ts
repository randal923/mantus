import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
import { PgMantusStore } from "./PgMantusStore";

const TEST_SCHEMA = "mantus_store_integration";
const MIGRATION_LOCK_KEY = 7_281_033;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

/** Catalog offers this suite exercises, with the prices the server pins. */
const PREMIUM_30 = { id: "premium-30", price: 250 };
const GOLD_CONVERTER = { id: "charges-23722-500", price: 5 };
const GREAT_HEALTH_250 = { id: "item-239-250", price: 41 };
const DEMON_EXERCISE_DUMMY_KIT = { id: "house-item-28561-1", price: 900 };
const PORTABLE_SELLER = { id: "item-60109-1", price: 900 };
const ARMOURED_WAR_HORSE = { id: "mount-23", price: 870 };
const WILDCARDS_5 = { id: "prey-wildcard-5", price: 50 };
const PREY_SLOT = { id: "prey-slot", price: 900 };
const XP_BOOST = { id: "exp-boost" };
const SEX_CHANGE = { id: "sex-change", price: 120 };
const NAME_CHANGE = { id: "name-change", price: 250 };

let setupClient: Client;
let pool: Pool;
let store: PgMantusStore;
let accountId: string;
let characterId: string;

const setCoins = async (amount: number): Promise<void> => {
  await pool.query("UPDATE accounts SET mantus_coins = $2 WHERE id = $1", [
    accountId,
    amount,
  ]);
};

/** Fills the carried tree to the 500-row cap a delivery must respect. */
const fillCarried = async (): Promise<void> => {
  const bound = await pool.query<{ id: string }>(
    `INSERT INTO items (
       id, item_type_id, count, location_type, character_id, equipment_slot
     ) VALUES (gen_random_uuid(), 23396, 1, 'equipment', $1, 'bound')
     RETURNING id`,
    [characterId],
  );
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, container_id, slot_index
     )
     SELECT gen_random_uuid(), 3031, 1, 'container', $1, slot
     FROM generate_series(0, 498) AS slot`,
    [bound.rows[0]!.id],
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
         town_id, sex
       ) VALUES (
         $1, $2, 'Store Hero', 'store hero', 'Knight',
         150, 50,
         100, 100, 7, 'south',
         128, 1, 1, 1, 1,
         1, 1
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
    const before = Date.now();

    const result = await store.purchase({
      accountId,
      characterId,
      offerId: PREMIUM_30.id,
      requestId: randomUUID(),
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(0);
    expect(result.price).toBe(PREMIUM_30.price);
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
      `SELECT event_type, details FROM audit_log WHERE character_id = $1`,
      [characterId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      event_type: "store-purchase",
      details: {
        accountId,
        offerId: "premium-30",
        kind: "premium",
        price: 250,
        balanceAfter: 0,
      },
    });
  });

  it("refuses an offer id that is not in the pinned catalog", async () => {
    await expect(
      store.purchase({
        accountId,
        characterId,
        offerId: "premium-9999",
        requestId: randomUUID(),
      }),
    ).resolves.toEqual({ status: "offer-not-found" });
    expect(
      await pool.query("SELECT id FROM mantus_coin_ledger"),
    ).toHaveProperty("rowCount", 0);
  });

  it("does not charge or grant premium when coins are insufficient", async () => {
    await setCoins(249);

    await expect(
      store.purchase({
        accountId,
        characterId,
        offerId: PREMIUM_30.id,
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
    const results = await Promise.all([
      store.purchase({
        accountId,
        characterId,
        offerId: PREMIUM_30.id,
        requestId: randomUUID(),
      }),
      store.purchase({
        accountId,
        characterId,
        offerId: PREMIUM_30.id,
        requestId: randomUUID(),
      }),
    ]);

    expect(
      results.filter((result) => result.status === "committed"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "insufficient-coins"),
    ).toHaveLength(1);
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

  it("delivers a charged item to the bound container in the purchase's own transaction", async () => {
    const result = await store.purchase({
      accountId,
      characterId,
      offerId: GOLD_CONVERTER.id,
      requestId: randomUUID(),
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(250 - GOLD_CONVERTER.price);
    expect(result.deliveredItems).toHaveLength(1);
    const delivered = await pool.query<{
      location_type: string;
      container_id: string;
      count: number;
      attributes: { charges?: number };
    }>(
      "SELECT location_type, container_id, count, attributes FROM items WHERE id = $1",
      [result.deliveredItems[0]?.id],
    );
    const boundRoot = await pool.query<{ id: string }>(
      `SELECT id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'bound'`,
      [characterId],
    );
    expect(delivered.rows[0]).toMatchObject({
      location_type: "container",
      container_id: boundRoot.rows[0]!.id,
      count: 1,
      attributes: { charges: 500 },
    });
    // Premium is untouched by a non-premium offer.
    const account = await pool.query<{ premium_until: Date | null }>(
      "SELECT premium_until FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.premium_until).toBeNull();
  });

  it("delivers a house dummy as a decoration kit naming its furniture", async () => {
    await pool.query("UPDATE accounts SET mantus_coins = 1000 WHERE id = $1", [
      accountId,
    ]);
    const result = await store.purchase({
      accountId,
      characterId,
      offerId: DEMON_EXERCISE_DUMMY_KIT.id,
      requestId: randomUUID(),
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.deliveredItems).toHaveLength(1);
    const delivered = await pool.query<{
      item_type_id: number;
      location_type: string;
      attributes: { unwrapTo?: number; description?: string };
    }>(
      "SELECT item_type_id, location_type, attributes FROM items WHERE id = $1",
      [result.deliveredItems[0]?.id],
    );
    // The buyer gets the wrapped kit, not the (uncarriable) dummy itself.
    expect(delivered.rows[0]).toMatchObject({
      item_type_id: 23_398,
      location_type: "container",
      attributes: {
        unwrapTo: 28_561,
        description:
          "Unwrap it in your own house to create a demon exercise dummy.",
      },
    });
  });

  it("splits a stackable product across stacks rather than overflowing one", async () => {
    const result = await store.purchase({
      accountId,
      characterId,
      offerId: GREAT_HEALTH_250.id,
      requestId: randomUUID(),
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    // 250 potions at a stack size of 100 is three rows, never one of 250.
    expect(result.deliveredItems).toHaveLength(3);
    const counts = await pool.query<{ count: number }>(
      `SELECT count FROM items
       WHERE location_type = 'container'
       ORDER BY count DESC`,
    );
    expect(counts.rows.map((row) => row.count)).toEqual([100, 100, 50]);
  });

  it("rolls the coin debit back when the carried tree cannot take the product", async () => {
    await fillCarried();

    const result = await store.purchase({
      accountId,
      characterId,
      offerId: GOLD_CONVERTER.id,
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
    const requestId = randomUUID();

    const first = await store.purchase({
      accountId,
      characterId,
      offerId: GOLD_CONVERTER.id,
      requestId,
    });
    const replay = await store.purchase({
      accountId,
      characterId,
      offerId: GOLD_CONVERTER.id,
      requestId,
    });

    expect(first.status).toBe("committed");
    expect(replay.status).toBe("committed");
    if (replay.status !== "committed") return;
    expect(replay.deliveredItems).toHaveLength(0);
    expect(replay.effect).toBeNull();
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe(
      String(250 - GOLD_CONVERTER.price),
    );
    expect(
      await pool.query("SELECT id FROM mantus_coin_ledger"),
    ).toHaveProperty("rowCount", 1);
    expect(
      await pool.query("SELECT id FROM items WHERE location_type = 'container'"),
    ).toHaveProperty("rowCount", 1);
  });

  it("refuses a second unique item and does not charge for it", async () => {
    await setCoins(2_000);

    const first = await store.purchase({
      accountId,
      characterId,
      offerId: PORTABLE_SELLER.id,
      requestId: randomUUID(),
    });
    const second = await store.purchase({
      accountId,
      characterId,
      offerId: PORTABLE_SELLER.id,
      requestId: randomUUID(),
    });

    expect(first.status).toBe("committed");
    expect(second).toEqual({ status: "already-owned" });
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe(String(2_000 - PORTABLE_SELLER.price));
  });

  it("grants an outfit for the buyer's own sex and refuses buying it twice", async () => {
    await setCoins(5_000);
    // "Full Arbalester Outfit": male 1449 / female 1450, both addons.
    const first = await store.purchase({
      accountId,
      characterId,
      offerId: "outfit-1449",
      requestId: randomUUID(),
    });

    expect(first.status).toBe("committed");
    if (first.status !== "committed") return;
    expect(first.effect).toEqual({
      kind: "outfit",
      lookType: 1449,
      addons: 3,
    });
    const owned = await pool.query<{ look_type: number; addons: number }>(
      "SELECT look_type, addons FROM character_outfits WHERE character_id = $1 ORDER BY look_type",
      [characterId],
    );
    // Both sexes' rows are granted, so a later sex change keeps the outfit.
    expect(owned.rows).toEqual([
      { look_type: 1449, addons: 3 },
      { look_type: 1450, addons: 3 },
    ]);

    const second = await store.purchase({
      accountId,
      characterId,
      offerId: "outfit-1449",
      requestId: randomUUID(),
    });
    expect(second).toEqual({ status: "already-owned" });
  });

  it("grants a mount once, even when two purchases race for it", async () => {
    await setCoins(5_000);

    const results = await Promise.all([
      store.purchase({
        accountId,
        characterId,
        offerId: ARMOURED_WAR_HORSE.id,
        requestId: randomUUID(),
      }),
      store.purchase({
        accountId,
        characterId,
        offerId: ARMOURED_WAR_HORSE.id,
        requestId: randomUUID(),
      }),
    ]);

    expect(
      results.filter((result) => result.status === "committed"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "already-owned"),
    ).toHaveLength(1);
    expect(
      await pool.query("SELECT mount_id FROM character_mounts WHERE character_id = $1", [
        characterId,
      ]),
    ).toHaveProperty("rowCount", 1);
    // Exactly one charge for exactly one mount.
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe(
      String(5_000 - ARMOURED_WAR_HORSE.price),
    );
  });

  it("credits prey wildcards up to the cap and refuses to charge at the cap", async () => {
    await setCoins(5_000);

    const first = await store.purchase({
      accountId,
      characterId,
      offerId: WILDCARDS_5.id,
      requestId: randomUUID(),
    });
    expect(first.status).toBe("committed");
    if (first.status !== "committed") return;
    expect(first.effect).toEqual({ kind: "prey-wildcard", balance: 5 });

    await pool.query(
      "UPDATE character_prey_resources SET wildcards = 50 WHERE character_id = $1",
      [characterId],
    );
    const atCap = await store.purchase({
      accountId,
      characterId,
      offerId: WILDCARDS_5.id,
      requestId: randomUUID(),
    });

    expect(atCap).toEqual({ status: "limit-reached" });
    const balance = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(balance.rows[0]?.mantus_coins).toBe(
      String(5_000 - WILDCARDS_5.price),
    );
  });

  it("unlocks one prey slot per purchase and refuses once none are locked", async () => {
    await setCoins(5_000);

    const first = await store.purchase({
      accountId,
      characterId,
      offerId: PREY_SLOT.id,
      requestId: randomUUID(),
    });
    const second = await store.purchase({
      accountId,
      characterId,
      offerId: PREY_SLOT.id,
      requestId: randomUUID(),
    });
    const third = await store.purchase({
      accountId,
      characterId,
      offerId: PREY_SLOT.id,
      requestId: randomUUID(),
    });

    expect(first.status).toBe("committed");
    expect(second.status).toBe("committed");
    // Slot 0 starts unlocked, so only slots 1 and 2 are ever for sale.
    expect(third).toEqual({ status: "already-owned" });
    const states = await pool.query<{ state: string }>(
      "SELECT state FROM character_prey_slots WHERE character_id = $1 ORDER BY slot",
      [characterId],
    );
    expect(states.rows.map((row) => row.state)).toEqual([
      "inactive",
      "inactive",
      "inactive",
    ]);
  });

  it("escalates the XP boost price with the day's purchases and caps it", async () => {
    await setCoins(5_000);
    const prices: number[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await store.purchase({
        accountId,
        characterId,
        offerId: XP_BOOST.id,
        requestId: randomUUID(),
      });
      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      prices.push(result.price);
    }

    // Canary's ExpBoostValues curve.
    expect(prices).toEqual([30, 45, 90, 180, 360, 720]);
    const seventh = await store.purchase({
      accountId,
      characterId,
      offerId: XP_BOOST.id,
      requestId: randomUUID(),
    });
    expect(seventh).toEqual({ status: "limit-reached" });

    const boost = await pool.query<{ xp_boost_until_ms: string }>(
      "SELECT xp_boost_until_ms::text AS xp_boost_until_ms FROM character_daily_rewards WHERE character_id = $1",
      [characterId],
    );
    // Six stacked hours, all of them still ahead of now.
    expect(Number(boost.rows[0]?.xp_boost_until_ms)).toBeGreaterThan(
      Date.now() + 5 * 60 * 60 * 1_000,
    );
  });

  it("flips sex and moves the worn outfit in one transaction", async () => {
    await setCoins(5_000);

    const result = await store.purchase({
      accountId,
      characterId,
      offerId: SEX_CHANGE.id,
      requestId: randomUUID(),
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.effect).toMatchObject({ kind: "sex-change", sex: "female" });
    const character = await pool.query<{
      sex: number;
      outfit_look_type: number;
      outfit_addons: number;
    }>(
      "SELECT sex, outfit_look_type, outfit_addons FROM characters WHERE id = $1",
      [characterId],
    );
    expect(character.rows[0]?.sex).toBe(0);
    // A male look type can never survive the flip.
    expect(character.rows[0]?.outfit_look_type).not.toBe(128);
    expect(character.rows[0]?.outfit_addons).toBe(0);
  });

  it("renames a character and refuses a name another character holds", async () => {
    await setCoins(5_000);
    const rivalId = randomUUID();
    await pool.query(
      `INSERT INTO characters (
         id, account_id, display_name, normalized_name, vocation, health, mana,
         position_x, position_y, position_z, direction,
         outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
         town_id
       ) VALUES ($1, $2, 'Taken Name', 'taken name', 'Knight', 150, 50,
         100, 100, 7, 'south', 128, 1, 1, 1, 1, 1)`,
      [rivalId, accountId],
    );

    const renamed = await store.purchase({
      accountId,
      characterId,
      offerId: NAME_CHANGE.id,
      requestId: randomUUID(),
      newName: "Fresh Start",
    });
    expect(renamed.status).toBe("committed");
    if (renamed.status !== "committed") return;
    expect(renamed.effect).toEqual({
      kind: "name-change",
      displayName: "Fresh Start",
    });

    const balanceBefore = 5_000 - NAME_CHANGE.price;
    const taken = await store.purchase({
      accountId,
      characterId,
      offerId: NAME_CHANGE.id,
      requestId: randomUUID(),
      newName: "Taken Name",
    });
    const reserved = await store.purchase({
      accountId,
      characterId,
      offerId: NAME_CHANGE.id,
      requestId: randomUUID(),
      newName: "Game Master",
    });

    expect(taken).toEqual({ status: "name-taken" });
    // Reserved words are refused exactly as character creation refuses them.
    expect(reserved).toEqual({ status: "name-invalid" });
    const account = await pool.query<{ mantus_coins: string }>(
      "SELECT mantus_coins FROM accounts WHERE id = $1",
      [accountId],
    );
    expect(account.rows[0]?.mantus_coins).toBe(String(balanceBefore));
    const character = await pool.query<{ normalized_name: string }>(
      "SELECT normalized_name FROM characters WHERE id = $1",
      [characterId],
    );
    expect(character.rows[0]?.normalized_name).toBe("fresh start");
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
    await store.purchase({
      accountId,
      characterId,
      offerId: PREMIUM_30.id,
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
      offerId: GOLD_CONVERTER.id,
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

  it("reports the facts the offer display needs, scoped to the character", async () => {
    await setCoins(2_000);
    await store.purchase({
      accountId,
      characterId,
      offerId: PORTABLE_SELLER.id,
      requestId: randomUUID(),
    });
    await store.purchase({
      accountId,
      characterId,
      offerId: XP_BOOST.id,
      requestId: randomUUID(),
    });

    const facts = await store.facts(characterId, [60109, 23722]);

    expect(facts.ownedUniqueItemTypeIds).toEqual([60109]);
    expect(facts.xpBoostPurchasesToday).toBe(1);
  });
});
