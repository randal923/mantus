import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgBankStore } from "./PgBankStore";

const TEST_SCHEMA = "bank_store_integration";
const MIGRATION_LOCK_KEY = 7_281_004;
const GOLD_TYPE = 3031;
const PLATINUM_TYPE = 3035;
const CRYSTAL_TYPE = 3043;
const HELMET_TYPE = 3355;
const BACKPACK_TYPE = 2854;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgBankStore;
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

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`bank-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Saver ${label}`,
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
     ON CONFLICT (character_id)
     DO UPDATE SET balance = $2`,
    [characterId, balance],
  );
};

const carriedWorth = async (characterId: string): Promise<number> => {
  const result = await pool.query<{ item_type_id: number; total: string }>(
    `WITH RECURSIVE owned AS (
       SELECT id, item_type_id, count FROM items
       WHERE character_id = $1
       UNION ALL
       SELECT child.id, child.item_type_id, child.count
       FROM items child JOIN owned ON child.container_id = owned.id
     )
     SELECT item_type_id, SUM(count) AS total FROM owned
     WHERE item_type_id IN ($2, $3, $4)
     GROUP BY item_type_id`,
    [characterId, GOLD_TYPE, PLATINUM_TYPE, CRYSTAL_TYPE],
  );
  return result.rows.reduce((total, row) => {
    const worth =
      row.item_type_id === GOLD_TYPE
        ? 1
        : row.item_type_id === PLATINUM_TYPE
          ? 100
          : 10_000;
    return total + Number(row.total) * worth;
  }, 0);
};

const totalWorth = async (characterId: string): Promise<number> =>
  (await carriedWorth(characterId)) + (await store.balance(characterId));

const ledgerRows = async (characterId: string) => {
  const result = await pool.query<{
    entry_type: string;
    amount: string;
    balance_after: string;
    counterparty_character_id: string | null;
  }>(
    `SELECT entry_type, amount, balance_after, counterparty_character_id
     FROM bank_ledger WHERE character_id = $1 ORDER BY id`,
    [characterId],
  );
  return result.rows;
};

const auditRows = async (eventType: string) => {
  const result = await pool.query<{ character_id: string; details: unknown }>(
    "SELECT character_id, details FROM audit_log WHERE event_type = $1",
    [eventType],
  );
  return result.rows;
};

databaseDescribe("PgBankStore integration", () => {
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
      "014_character_storages.sql",
      "015_depot_and_inbox.sql",
      "018_pvp.sql",
      "019_houses.sql",
      "020_social.sql",
      "021_moderation.sql",
      "023_character_action_bar.sql",
      "029_character_potion_action_bar.sql",
      "032_remove_loose_inventory.sql",
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
    store = new PgBankStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
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

  it("deposits coins, credits the balance, and audits in one transaction", async () => {
    const goldId = await insertBackpackItem(characterId, GOLD_TYPE, 100, 0);
    await insertBackpackItem(characterId, PLATINUM_TYPE, 3, 1);

    const result = await store.deposit(characterId, 120);

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(120);
    expect(await store.balance(characterId)).toBe(120);
    expect(await carriedWorth(characterId)).toBe(280);
    expect(result.mutation.removedItemIds).not.toContain(goldId);
    expect(await ledgerRows(characterId)).toEqual([
      {
        entry_type: "deposit",
        amount: "120",
        balance_after: "120",
        counterparty_character_id: null,
      },
    ]);
    expect(await auditRows("bank-deposit")).toHaveLength(1);
    expect((await auditRows("item-destroyed")).length).toBeGreaterThan(0);
  });

  it("makes change when a large coin covers a small deposit", async () => {
    await insertBackpackItem(characterId, PLATINUM_TYPE, 3, 0);

    const result = await store.deposit(characterId, 250);

    expect(result.status).toBe("committed");
    expect(await store.balance(characterId)).toBe(250);
    expect(await carriedWorth(characterId)).toBe(50);
    const coins = await pool.query<{ item_type_id: number; count: number }>(
      `WITH RECURSIVE owned AS (
         SELECT id, item_type_id, count FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id, child.item_type_id, child.count
         FROM items child JOIN owned ON child.container_id = owned.id
       )
       SELECT item_type_id, count FROM owned
       WHERE item_type_id IN ($2, $3, $4)`,
      [characterId, GOLD_TYPE, PLATINUM_TYPE, CRYSTAL_TYPE],
    );
    expect(coins.rows).toEqual([{ item_type_id: GOLD_TYPE, count: 50 }]);
  });

  it("changes nothing when carried coins cannot cover the deposit", async () => {
    await insertBackpackItem(characterId, GOLD_TYPE, 40, 0);

    const result = await store.deposit(characterId, 100);

    expect(result.status).toBe("insufficient-funds");
    expect(await store.balance(characterId)).toBe(0);
    expect(await carriedWorth(characterId)).toBe(40);
    expect(await ledgerRows(characterId)).toEqual([]);
    expect(await auditRows("bank-deposit")).toEqual([]);
    expect(await auditRows("item-destroyed")).toEqual([]);
  });

  it("withdraws the fewest coins and debits the balance atomically", async () => {
    await setBalance(characterId, 20_000);

    const result = await store.withdraw(characterId, 12_345);

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(7_655);
    expect(await carriedWorth(characterId)).toBe(12_345);
    const coins = await pool.query<{ item_type_id: number; count: number }>(
      `WITH RECURSIVE owned AS (
         SELECT id, item_type_id, count FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id, child.item_type_id, child.count
         FROM items child JOIN owned ON child.container_id = owned.id
       )
       SELECT item_type_id, count FROM owned
       WHERE item_type_id IN ($2, $3, $4)
       ORDER BY item_type_id`,
      [characterId, GOLD_TYPE, PLATINUM_TYPE, CRYSTAL_TYPE],
    );
    expect(coins.rows).toEqual([
      { item_type_id: GOLD_TYPE, count: 45 },
      { item_type_id: PLATINUM_TYPE, count: 23 },
      { item_type_id: CRYSTAL_TYPE, count: 1 },
    ]);
    expect(await ledgerRows(characterId)).toEqual([
      {
        entry_type: "withdraw",
        amount: "12345",
        balance_after: "7655",
        counterparty_character_id: null,
      },
    ]);
    expect(await auditRows("bank-withdraw")).toHaveLength(1);
    expect(await auditRows("item-created")).toHaveLength(3);
  });

  it("changes nothing when the balance cannot cover the withdrawal", async () => {
    await setBalance(characterId, 99);

    const result = await store.withdraw(characterId, 100);

    expect(result.status).toBe("insufficient-balance");
    expect(await store.balance(characterId)).toBe(99);
    expect(await carriedWorth(characterId)).toBe(0);
    expect(await ledgerRows(characterId)).toEqual([]);
  });

  it("changes nothing when the coins cannot fit the backpack", async () => {
    await setBalance(characterId, 300);
    for (let slot = 0; slot < 20; slot++) {
      await insertBackpackItem(characterId, HELMET_TYPE, 1, slot);
    }

    const result = await store.withdraw(characterId, 300);

    expect(result.status).toBe("no-space");
    expect(await store.balance(characterId)).toBe(300);
    expect(await carriedWorth(characterId)).toBe(0);
    expect(await ledgerRows(characterId)).toEqual([]);
    expect(await auditRows("item-created")).toEqual([]);
  });

  it("lets exactly one of two racing withdrawals spend the balance", async () => {
    await setBalance(characterId, 100);

    const outcomes = await Promise.allSettled([
      store.withdraw(characterId, 100),
      store.withdraw(characterId, 100),
    ]);

    const committed = outcomes.filter(
      (outcome) =>
        outcome.status === "fulfilled" &&
        outcome.value.status === "committed",
    );
    expect(committed).toHaveLength(1);
    expect(await store.balance(characterId)).toBe(0);
    expect(await carriedWorth(characterId)).toBe(100);
    expect(await ledgerRows(characterId)).toHaveLength(1);
  });

  it("lets exactly one of two racing deposits spend the same coins", async () => {
    await insertBackpackItem(characterId, GOLD_TYPE, 100, 0);

    const outcomes = await Promise.allSettled([
      store.deposit(characterId, 100),
      store.deposit(characterId, 100),
    ]);

    const committed = outcomes.filter(
      (outcome) =>
        outcome.status === "fulfilled" &&
        outcome.value.status === "committed",
    );
    expect(committed).toHaveLength(1);
    expect(await store.balance(characterId)).toBe(100);
    expect(await carriedWorth(characterId)).toBe(0);
    expect(await ledgerRows(characterId)).toHaveLength(1);
  });

  it("conserves total currency under concurrent conversion requests", async () => {
    await insertBackpackItem(characterId, GOLD_TYPE, 100, 0);
    await setBalance(characterId, 50);

    await Promise.allSettled([
      store.deposit(characterId, 60),
      store.withdraw(characterId, 50),
      store.deposit(characterId, 40),
    ]);

    expect(await totalWorth(characterId)).toBe(150);
  });

  it("transfers between accounts with ledger entries for both parties", async () => {
    const recipientId = await createCharacter("beta");
    await setBalance(characterId, 800);

    const result = await store.transfer(characterId, "Saver Beta", 500);

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.balance).toBe(300);
    expect(result.toCharacterId).toBe(recipientId);
    expect(await store.balance(characterId)).toBe(300);
    expect(await store.balance(recipientId)).toBe(500);
    expect(await ledgerRows(characterId)).toEqual([
      {
        entry_type: "transfer-out",
        amount: "500",
        balance_after: "300",
        counterparty_character_id: recipientId,
      },
    ]);
    expect(await ledgerRows(recipientId)).toEqual([
      {
        entry_type: "transfer-in",
        amount: "500",
        balance_after: "500",
        counterparty_character_id: characterId,
      },
    ]);
    expect(await auditRows("bank-transfer")).toHaveLength(1);
  });

  it("rejects transfers to unknown or self recipients without changes", async () => {
    await setBalance(characterId, 800);

    expect((await store.transfer(characterId, "Nobody Here", 100)).status).toBe(
      "recipient-not-found",
    );
    expect((await store.transfer(characterId, "Saver Alpha", 100)).status).toBe(
      "invalid-recipient",
    );
    const recipientId = await createCharacter("beta");
    expect((await store.transfer(characterId, "Saver Beta", 900)).status).toBe(
      "insufficient-balance",
    );
    expect(await store.balance(characterId)).toBe(800);
    expect(await store.balance(recipientId)).toBe(0);
    expect(await ledgerRows(characterId)).toEqual([]);
  });

  it("lets exactly one of two racing transfers debit the sender", async () => {
    const recipientId = await createCharacter("beta");
    await setBalance(characterId, 100);

    const outcomes = await Promise.allSettled([
      store.transfer(characterId, "Saver Beta", 100),
      store.transfer(characterId, "Saver Beta", 100),
    ]);

    const committed = outcomes.filter(
      (outcome) =>
        outcome.status === "fulfilled" &&
        outcome.value.status === "committed",
    );
    expect(committed).toHaveLength(1);
    expect(await store.balance(characterId)).toBe(0);
    expect(await store.balance(recipientId)).toBe(100);
  });
});
