import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
import { PgNpcTravelStore } from "./PgNpcTravelStore";

const TEST_SCHEMA = "npc_travel_store_integration";
const MIGRATION_LOCK_KEY = 7_281_017;
const GOLD_TYPE = 3031;
const PLATINUM_TYPE = 3035;
const DESTINATION = { x: 32_310, y: 32_210, z: 6 } as const;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgNpcTravelStore;
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

const ledgerRows = async (): Promise<
  ReadonlyArray<{ entry_type: string; amount: string }>
> => {
  const result = await pool.query<{ entry_type: string; amount: string }>(
    "SELECT entry_type, amount FROM bank_ledger WHERE character_id = $1",
    [characterId],
  );
  return result.rows;
};

const travelAudits = async (): Promise<
  ReadonlyArray<{ cost: number; bankSpent: number }>
> => {
  const result = await pool.query<{ details: Record<string, unknown> }>(
    "SELECT details FROM audit_log WHERE event_type = 'npc-travel'",
  );
  return result.rows.map((row) => ({
    cost: Number(row.details.cost),
    bankSpent: Number(row.details.bankSpent),
  }));
};

databaseDescribe("PgNpcTravelStore integration", () => {
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
    store = new PgNpcTravelStore(pool, await loadItemCatalog());
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
      [`npc-travel-${randomUUID()}`],
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
      displayName: "Travel Hero",
      vocation: "Knight",
      lookType: 128,
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

  it("pays a fare partly from carried coins and partly from the bank", async () => {
    await giveCoins(GOLD_TYPE, 40, 0);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 500)",
      [characterId],
    );

    const result = await store.commit(
      characterId,
      1,
      DESTINATION,
      110,
      "captain-breezelda",
      "thais",
    );

    expect(result.status).toBe("committed");
    // Carried is spent first, the bank covers only the shortfall.
    expect(await carriedWorth()).toBe(0);
    expect(await balance()).toBe(430);
    expect(await ledgerRows()).toEqual([
      { entry_type: "npc-travel", amount: "70" },
    ]);
    expect(await travelAudits()).toEqual([{ cost: 110, bankSpent: 70 }]);
  });

  it("spends only carried coins when they cover the fare", async () => {
    await giveCoins(PLATINUM_TYPE, 2, 0);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 500)",
      [characterId],
    );

    const result = await store.commit(
      characterId,
      1,
      DESTINATION,
      110,
      "captain-breezelda",
      "thais",
    );

    expect(result.status).toBe("committed");
    expect(await carriedWorth()).toBe(90);
    expect(await balance()).toBe(500);
    expect(await ledgerRows()).toEqual([]);
    expect(await travelAudits()).toEqual([{ cost: 110, bankSpent: 0 }]);
  });

  it("rejects an unaffordable fare without any partial debit", async () => {
    await giveCoins(GOLD_TYPE, 40, 0);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 50)",
      [characterId],
    );

    const result = await store.commit(
      characterId,
      1,
      DESTINATION,
      110,
      "captain-breezelda",
      "thais",
    );

    expect(result.status).toBe("insufficient-funds");
    expect(await carriedWorth()).toBe(40);
    expect(await balance()).toBe(50);
    expect(await ledgerRows()).toEqual([]);
    expect(await travelAudits()).toEqual([]);
    const position = await pool.query<{ position_x: number }>(
      "SELECT position_x FROM characters WHERE id = $1",
      [characterId],
    );
    expect(position.rows[0]?.position_x).toBe(100);
  });

  it("cannot double-charge when two confirmations race", async () => {
    await giveCoins(GOLD_TYPE, 40, 0);
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 100)",
      [characterId],
    );

    const attempts = await Promise.allSettled([
      store.commit(
        characterId,
        1,
        DESTINATION,
        110,
        "captain-breezelda",
        "thais",
      ),
      store.commit(
        characterId,
        1,
        DESTINATION,
        110,
        "captain-breezelda",
        "thais",
      ),
    ]);

    // The character version guard lets exactly one confirmation through.
    expect(
      attempts.filter(
        (attempt) =>
          attempt.status === "fulfilled" &&
          attempt.value.status === "committed",
      ),
    ).toHaveLength(1);
    expect(await carriedWorth()).toBe(0);
    expect(await balance()).toBe(30);
    expect(await ledgerRows()).toEqual([
      { entry_type: "npc-travel", amount: "70" },
    ]);
    expect(await travelAudits()).toHaveLength(1);
  });
});
