import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { blessingMaskOf } from "../progression/blessings";
import { applyMigrations } from "../test/applyMigrations";
import { PgBlessStore } from "./PgBlessStore";

const TEST_SCHEMA = "bless_store_integration";
const MIGRATION_LOCK_KEY = 7_281_021;
const GOLD_TYPE = 3031;
const PLATINUM_TYPE = 3035;
const REGULAR_IDS = [2, 3, 4, 5, 6];
const REGULAR_MASK = blessingMaskOf(REGULAR_IDS);
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgBlessStore;
let characterId: string;

const giveCoins = async (typeId: number, count: number, slot: number) => {
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, container_id, slot_index
     )
     SELECT $1, $2, $3, 'container', id, $5
     FROM items
     WHERE character_id = $4 AND location_type = 'equipment'
       AND equipment_slot = 'backpack'`,
    [randomUUID(), typeId, count, characterId, slot],
  );
};

const carriedWorth = async (): Promise<number> => {
  const result = await pool.query<{ worth: string | null }>(
    `WITH RECURSIVE owned AS (
       SELECT id, item_type_id, count FROM items WHERE character_id = $1
       UNION ALL
       SELECT child.id, child.item_type_id, child.count
       FROM items child JOIN owned ON child.container_id = owned.id
     )
     SELECT sum(
       count * CASE item_type_id
         WHEN 3031 THEN 1 WHEN 3035 THEN 100 WHEN 3043 THEN 10000 ELSE 0
       END
     ) AS worth
     FROM owned`,
    [characterId],
  );
  return Number(result.rows[0]?.worth ?? 0);
};

const balance = async (): Promise<number> => {
  const result = await pool.query<{ balance: string }>(
    "SELECT balance FROM bank_accounts WHERE character_id = $1",
    [characterId],
  );
  return Number(result.rows[0]?.balance ?? 0);
};

const blessingsColumn = async (): Promise<number> => {
  const result = await pool.query<{ blessings: number }>(
    "SELECT blessings FROM characters WHERE id = $1",
    [characterId],
  );
  return result.rows[0]?.blessings ?? -1;
};

const ledgerRows = async (): Promise<
  ReadonlyArray<{ entry_type: string; amount: string }>
> => {
  const result = await pool.query<{ entry_type: string; amount: string }>(
    "SELECT entry_type, amount FROM bank_ledger WHERE character_id = $1",
    [characterId],
  );
  return result.rows;
};

const blessAudits = async (): Promise<
  ReadonlyArray<{ blessingIds: number[]; price: number; bankSpent: number }>
> => {
  const result = await pool.query<{ details: Record<string, unknown> }>(
    "SELECT details FROM audit_log WHERE event_type = 'bless-purchase'",
  );
  return result.rows.map((row) => ({
    blessingIds: row.details.blessingIds as number[],
    price: Number(row.details.price),
    bankSpent: Number(row.details.bankSpent),
  }));
};

databaseDescribe("PgBlessStore integration", () => {
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
    store = new PgBlessStore(pool, await loadItemCatalog());
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
      [`bless-${randomUUID()}`],
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
      displayName: "Bless Hero",
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
       ) VALUES ($1, 2854, 'equipment', $2, 'backpack')`,
      [randomUUID(), characterId],
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

  it("grants the full bless, paying carried coins first and the bank rest", async () => {
    // Level 1: a regular bless is 2000, five missing times 1.1 = 11000.
    await giveCoins(PLATINUM_TYPE, 5, 0);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 11000)",
      [characterId],
    );

    const result = await store.commit(characterId, 1, REGULAR_IDS, 10, "henricus");

    expect(result).toMatchObject({
      status: "committed",
      characterVersion: 2,
      grantedMask: REGULAR_MASK,
      price: 11_000,
    });
    expect(await blessingsColumn()).toBe(REGULAR_MASK);
    expect(await carriedWorth()).toBe(0);
    expect(await balance()).toBe(500);
    expect(await ledgerRows()).toEqual([
      { entry_type: "bless-purchase", amount: "10500" },
    ]);
    expect(await blessAudits()).toEqual([
      { blessingIds: REGULAR_IDS, price: 11_000, bankSpent: 10_500 },
    ]);
  });

  it("charges only the blessings the character is missing", async () => {
    await pool.query("UPDATE characters SET blessings = $2 WHERE id = $1", [
      characterId,
      blessingMaskOf([2]),
    ]);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 20000)",
      [characterId],
    );

    const result = await store.commit(characterId, 1, REGULAR_IDS, 10, "henricus");

    // Four missing at 2000 each, times 1.1.
    expect(result).toMatchObject({ status: "committed", price: 8_800 });
    expect(await blessingsColumn()).toBe(REGULAR_MASK);
    expect(await balance()).toBe(11_200);
    expect(await blessAudits()).toEqual([
      { blessingIds: [3, 4, 5, 6], price: 8_800, bankSpent: 8_800 },
    ]);
  });

  it("rejects an unaffordable purchase without any partial debit or grant", async () => {
    await giveCoins(GOLD_TYPE, 40, 0);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 100)",
      [characterId],
    );

    const result = await store.commit(characterId, 1, [5], 0, "henricus");

    expect(result).toEqual({ status: "insufficient-funds" });
    expect(await blessingsColumn()).toBe(0);
    expect(await carriedWorth()).toBe(40);
    expect(await balance()).toBe(100);
    expect(await ledgerRows()).toEqual([]);
    expect(await blessAudits()).toEqual([]);
  });

  it("refuses to sell a blessing the character already holds", async () => {
    await pool.query("UPDATE characters SET blessings = $2 WHERE id = $1", [
      characterId,
      REGULAR_MASK,
    ]);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 20000)",
      [characterId],
    );

    const result = await store.commit(characterId, 1, [5], 0, "henricus");

    expect(result).toEqual({ status: "already-blessed" });
    expect(await balance()).toBe(20_000);
    expect(await blessAudits()).toEqual([]);
  });

  it("cannot double-charge when two confirmations race", async () => {
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 5000)",
      [characterId],
    );

    const attempts = await Promise.allSettled([
      store.commit(characterId, 1, [5], 0, "henricus"),
      store.commit(characterId, 1, [5], 0, "henricus"),
    ]);

    // The character version guard lets exactly one confirmation through.
    expect(
      attempts.filter(
        (attempt) =>
          attempt.status === "fulfilled" &&
          attempt.value.status === "committed",
      ),
    ).toHaveLength(1);
    expect(await blessingsColumn()).toBe(blessingMaskOf([5]));
    expect(await balance()).toBe(3_000);
    expect(await ledgerRows()).toEqual([
      { entry_type: "bless-purchase", amount: "2000" },
    ]);
    expect(await blessAudits()).toHaveLength(1);
  });
});
