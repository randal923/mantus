import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgDepotStore } from "../depot/PgDepotStore";
import { PgMarketStore } from "./PgMarketStore";
import type { EscrowSource } from "./MarketStore";

const TEST_SCHEMA = "market_store_integration";
const MIGRATION_LOCK_KEY = 7_281_006;
/** Small enchanted sapphire: stackable, marketable (valuables). */
const SAPPHIRE_TYPE = 675;
/** Leather helmet: non-stackable, marketable (helmets). */
const HELMET_TYPE = 3355;
const BACKPACK_TYPE = 2854;
const GOLD_TYPE = 3031;
const PLATINUM_TYPE = 3035;
const CRYSTAL_TYPE = 3043;
const DEPOT_ID = 1;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgMarketStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const insertDepotItem = async (
  characterId: string,
  typeId: number,
  count: number,
  slot: number,
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, character_id, slot_index, depot_id
     ) VALUES ($1, $2, $3, 'depot', $4, $5, $6)`,
    [id, typeId, count, characterId, slot, DEPOT_ID],
  );
  return id;
};

const createCharacter = async (
  label: string,
  accountId?: string,
): Promise<{ characterId: string; accountId: string }> => {
  let resolvedAccountId = accountId;
  if (!resolvedAccountId) {
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ($1, 'en')
       RETURNING id`,
      [`market-integration-${label}`],
    );
    resolvedAccountId = account.rows[0]?.id;
    if (!resolvedAccountId) throw new Error("account insert returned no id");
  }
  await characterService.create(resolvedAccountId, {
    displayName: `Trader ${label}`,
    vocation: "Knight",
    lookType: 128,
  });
  const summaries = await characterStore.listByAccountId(resolvedAccountId);
  const summary = summaries[summaries.length - 1];
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
  return { characterId: summary.id, accountId: resolvedAccountId };
};

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

const carriedWorthOf = async (characterId: string): Promise<number> => {
  const result = await pool.query<{ item_type_id: number; total: string }>(
    `WITH RECURSIVE owned AS (
       SELECT id, item_type_id, count FROM items
       WHERE character_id = $1
         AND location_type = 'equipment'
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

/** Gold in the whole system including carried coins, escrow, and banks. */
const systemGoldTotal = async (): Promise<number> => {
  const coins = await pool.query<{ item_type_id: number; total: string }>(
    `SELECT item_type_id, SUM(count) AS total FROM items
     WHERE item_type_id IN ($1, $2, $3)
     GROUP BY item_type_id`,
    [GOLD_TYPE, PLATINUM_TYPE, CRYSTAL_TYPE],
  );
  const coinWorth = coins.rows.reduce((total, row) => {
    const worth =
      row.item_type_id === GOLD_TYPE
        ? 1
        : row.item_type_id === PLATINUM_TYPE
          ? 100
          : 10_000;
    return total + Number(row.total) * worth;
  }, 0);
  return coinWorth + (await globalGoldTotal());
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

const balanceOf = async (characterId: string): Promise<number> => {
  const result = await pool.query<{ balance: string }>(
    "SELECT balance FROM bank_accounts WHERE character_id = $1",
    [characterId],
  );
  return Number(result.rows[0]?.balance ?? 0);
};

const itemCountAt = async (
  characterId: string,
  location: string,
  typeId: number,
): Promise<number> => {
  const result = await pool.query<{ total: string | null }>(
    `SELECT SUM(count) AS total FROM items
     WHERE character_id = $1 AND location_type = $2 AND item_type_id = $3`,
    [characterId, location, typeId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

/** Total items of a type across every location: dupes/vanishing show up here. */
const globalItemTotal = async (typeId: number): Promise<number> => {
  const result = await pool.query<{ total: string | null }>(
    "SELECT SUM(count) AS total FROM items WHERE item_type_id = $1",
    [typeId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

/** All gold in the closed system: bank balances plus escrowed buy funds. */
const globalGoldTotal = async (): Promise<number> => {
  const banks = await pool.query<{ total: string | null }>(
    "SELECT SUM(balance) AS total FROM bank_accounts",
  );
  const escrow = await pool.query<{ total: string | null }>(
    "SELECT SUM(escrow_balance) AS total FROM market_offers",
  );
  return Number(banks.rows[0]?.total ?? 0) + Number(escrow.rows[0]?.total ?? 0);
};

const feesPaid = async (): Promise<number> => {
  const result = await pool.query<{ total: string | null }>(
    "SELECT SUM(amount) AS total FROM bank_ledger WHERE entry_type = 'market-fee'",
  );
  return Number(result.rows[0]?.total ?? 0);
};

const offerRows = async () => {
  const result = await pool.query<{
    id: string;
    character_id: string;
    side: "buy" | "sell";
    remaining_amount: number;
    escrow_balance: string;
  }>(
    `SELECT id, character_id, side, remaining_amount, escrow_balance
     FROM market_offers ORDER BY created_at`,
  );
  return result.rows;
};

const escrowRowsOf = async (characterId: string) => {
  const result = await pool.query<{ id: string; count: number }>(
    `SELECT id, count FROM items
     WHERE character_id = $1 AND location_type = 'market-escrow'
     ORDER BY slot_index`,
    [characterId],
  );
  return result.rows;
};

const historyRows = async (characterId?: string) => {
  const result = await pool.query<{
    character_id: string;
    role: string;
    side: string;
    amount: number;
    state: string;
  }>(
    `SELECT character_id, role, side, amount, state FROM market_history
     ${characterId ? "WHERE character_id = $1" : ""} ORDER BY id`,
    characterId ? [characterId] : [],
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

const ledgerRows = async (characterId: string) => {
  const result = await pool.query<{
    entry_type: string;
    amount: string;
    balance_after: string;
  }>(
    `SELECT entry_type, amount, balance_after
     FROM bank_ledger WHERE character_id = $1 ORDER BY id`,
    [characterId],
  );
  return result.rows;
};

const sourcesFor = async (
  characterId: string,
  typeId: number,
  amount: number,
): Promise<EscrowSource[]> => {
  const result = await pool.query<{ id: string; count: number; version: number }>(
    `SELECT id, count, version FROM items
     WHERE character_id = $1 AND location_type = 'depot' AND item_type_id = $2
     ORDER BY id`,
    [characterId, typeId],
  );
  const sources: EscrowSource[] = [];
  let remaining = amount;
  for (const row of result.rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.count, remaining);
    sources.push({ itemId: row.id, itemRevision: row.version, take });
    remaining -= take;
  }
  if (remaining > 0) throw new Error("test depot stock is too small");
  return sources;
};

const sellRequest = async (
  characterId: string,
  typeId: number,
  amount: number,
  unitPrice: number,
  overrides?: Partial<Parameters<PgMarketStore["createSellOffer"]>[0]>,
) => ({
  requestId: randomUUID(),
  characterId,
  itemTypeId: typeId,
  amount,
  unitPrice,
  totalPrice: amount * unitPrice,
  fee: Math.min(1_000_000, Math.max(20, Math.floor((amount * unitPrice) / 50))),
  sources: await sourcesFor(characterId, typeId, amount),
  ...overrides,
});

const buyRequest = (
  characterId: string,
  typeId: number,
  amount: number,
  unitPrice: number,
) => ({
  requestId: randomUUID(),
  characterId,
  itemTypeId: typeId,
  amount,
  unitPrice,
  totalPrice: amount * unitPrice,
  fee: Math.min(1_000_000, Math.max(20, Math.floor((amount * unitPrice) / 50))),
});

databaseDescribe("PgMarketStore integration", () => {
  let sellerId: string;
  let sellerAccountId: string;
  let buyerId: string;

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
      "016_market.sql",
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
    store = new PgMarketStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM market_escrow_items");
    await pool.query("DELETE FROM market_offers");
    await pool.query("DELETE FROM market_history");
    await pool.query("DELETE FROM market_requests");
    await pool.query("DELETE FROM inbox_deliveries");
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM character_depots");
    await pool.query("DELETE FROM character_storage_state");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const seller = await createCharacter("seller");
    sellerId = seller.characterId;
    sellerAccountId = seller.accountId;
    const buyer = await createCharacter("buyer");
    buyerId = buyer.characterId;
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

  describe("sell offer creation", () => {
    it("escrows items, charges the fee, and audits in one transaction", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 1_000);

      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(await itemCountAt(sellerId, "depot", SAPPHIRE_TYPE)).toBe(0);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
      expect(await balanceOf(sellerId)).toBe(0); // fee = 2% of 50_000 = 1_000
      expect(await ledgerRows(sellerId)).toEqual([
        { entry_type: "market-fee", amount: "1000", balance_after: "0" },
      ]);
      expect(await auditRows("market-offer-created")).toHaveLength(1);
      expect(await auditRows("item-transferred")).toHaveLength(1);
      const offers = await offerRows();
      expect(offers).toHaveLength(1);
      expect(offers[0]?.side).toBe("sell");
      expect(offers[0]?.remaining_amount).toBe(100);
      expect(offers[0]?.escrow_balance).toBe("0");
      expect(result.removedItemIds).toHaveLength(1);
      expect(result.depotUpserts).toHaveLength(0);
    });

    it("splits a stack when selling part of it and audits the split", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 50, 0);
      await setBalance(sellerId, 100);

      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 20, 10),
      );

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(await itemCountAt(sellerId, "depot", SAPPHIRE_TYPE)).toBe(30);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        20,
      );
      expect(result.depotUpserts).toHaveLength(1);
      expect(result.depotUpserts[0]?.count).toBe(30);
      expect(await auditRows("item-split")).toHaveLength(1);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(50);
    });

    it("commits nothing when the fee cannot be paid", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 5);

      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );

      expect(result.status).toBe("insufficient-funds");
      expect(await itemCountAt(sellerId, "depot", SAPPHIRE_TYPE)).toBe(100);
      expect(await escrowRowsOf(sellerId)).toHaveLength(0);
      expect(await offerRows()).toHaveLength(0);
      expect(await ledgerRows(sellerId)).toHaveLength(0);
      expect(await auditRows("market-offer-created")).toHaveLength(0);
      expect(await balanceOf(sellerId)).toBe(5);
    });

    it("rejects an escrow source that is not in the seller's depot", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 1_000);
      const foreignId = await insertDepotItem(buyerId, SAPPHIRE_TYPE, 100, 0);

      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500, {
          sources: [{ itemId: foreignId, itemRevision: 1, take: 100 }],
        }),
      );

      expect(result.status).toBe("not-owned");
      expect(await offerRows()).toHaveLength(0);
      expect(await itemCountAt(buyerId, "depot", SAPPHIRE_TYPE)).toBe(100);
    });

    it("rejects a stale item revision at execution time", async () => {
      const itemId = await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 1_000);

      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500, {
          sources: [{ itemId, itemRevision: 99, take: 100 }],
        }),
      );

      expect(result.status).toBe("not-owned");
      expect(await offerRows()).toHaveLength(0);
    });

    it("replaying the same requestId cannot create a second offer", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 1);
      await setBalance(sellerId, 10_000);
      const request = await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500);

      const first = await store.createSellOffer(request);
      const replay = await store.createSellOffer(request);

      expect(first.status).toBe("committed");
      expect(replay.status).toBe("duplicate-request");
      expect(await offerRows()).toHaveLength(1);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
    });

    it("two offers racing for the same depot item escrow it exactly once", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 100_000);
      const requestA = await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500);
      const requestB = await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500);

      const outcomes = await Promise.allSettled([
        store.createSellOffer(requestA),
        store.createSellOffer(requestB),
      ]);

      const committed = outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" &&
          outcome.value.status === "committed",
      );
      expect(committed).toHaveLength(1);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(100);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
      expect(await offerRows()).toHaveLength(1);
    });

    it("an already-escrowed item cannot back a second offer", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      const request = await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500);
      const first = await store.createSellOffer(request);
      expect(first.status).toBe("committed");
      const escrowed = await escrowRowsOf(sellerId);

      const second = await store.createSellOffer({
        requestId: randomUUID(),
        characterId: sellerId,
        itemTypeId: SAPPHIRE_TYPE,
        amount: 100,
        unitPrice: 500,
        totalPrice: 50_000,
        fee: 1_000,
        sources: [
          { itemId: escrowed[0]?.id ?? "", itemRevision: 2, take: 100 },
        ],
      });

      expect(second.status).toBe("not-owned");
      expect(await offerRows()).toHaveLength(1);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(100);
    });

    it("enforces the active offer cap", async () => {
      await setBalance(sellerId, 1_000_000);
      await pool.query(
        `INSERT INTO market_offers (
           character_id, account_id, side, item_type_id, amount,
           remaining_amount, unit_price, fee_paid, escrow_balance, expires_at
         )
         SELECT $1, $2, 'buy', $3, 1, 1, 1, 20, 1, now() + interval '30 days'
         FROM generate_series(1, 100)`,
        [sellerId, sellerAccountId, SAPPHIRE_TYPE],
      );
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);

      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );

      expect(result.status).toBe("offer-limit");
      expect(await itemCountAt(sellerId, "depot", SAPPHIRE_TYPE)).toBe(100);
    });
  });

  describe("buy offer creation", () => {
    it("escrows funds plus fee with ledger entries in one transaction", async () => {
      await setBalance(buyerId, 100_000);

      const result = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 50, 1_000),
      );

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      // fee = 2% of 50_000 = 1_000; escrow = 50_000
      expect(await balanceOf(buyerId)).toBe(49_000);
      expect(result.balance).toBe(49_000);
      const offers = await offerRows();
      expect(offers[0]?.escrow_balance).toBe("50000");
      expect(await ledgerRows(buyerId)).toEqual([
        { entry_type: "market-fee", amount: "1000", balance_after: "99000" },
        {
          entry_type: "market-escrow",
          amount: "50000",
          balance_after: "49000",
        },
      ]);
      expect(await auditRows("market-offer-created")).toHaveLength(1);
    });

    it("commits nothing when funds cannot cover escrow plus fee", async () => {
      await setBalance(buyerId, 50_500); // needs 51_000

      const result = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 50, 1_000),
      );

      expect(result.status).toBe("insufficient-funds");
      expect(await balanceOf(buyerId)).toBe(50_500);
      expect(await offerRows()).toHaveLength(0);
      expect(await ledgerRows(buyerId)).toHaveLength(0);
    });

    it("two buy offers racing one balance cannot overdraw it", async () => {
      await setBalance(buyerId, 51_000); // covers exactly one offer

      const outcomes = await Promise.allSettled([
        store.createBuyOffer(buyRequest(buyerId, SAPPHIRE_TYPE, 50, 1_000)),
        store.createBuyOffer(buyRequest(buyerId, SAPPHIRE_TYPE, 50, 1_000)),
      ]);

      const committed = outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" &&
          outcome.value.status === "committed",
      );
      expect(committed).toHaveLength(1);
      expect(await balanceOf(buyerId)).toBe(0);
      expect(await globalGoldTotal()).toBe(50_000); // 1_000 fee destroyed
      expect(await offerRows()).toHaveLength(1);
    });
  });

  describe("accepting sell offers", () => {
    const listSapphires = async (amount: number, unitPrice: number) => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, amount, 0);
      await setBalance(sellerId, 10_000);
      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, amount, unitPrice),
      );
      if (result.status !== "committed") {
        throw new Error(`listing failed: ${result.status}`);
      }
      return result.offerId;
    };

    it("delivers items to the buyer's inbox and pays the seller's bank", async () => {
      const offerId = await listSapphires(100, 500);
      const sellerBalanceAfterFee = await balanceOf(sellerId);
      await setBalance(buyerId, 60_000);

      const result = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: buyerId,
        amount: 100,
      });

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(result.totalPrice).toBe(50_000);
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        0,
      );
      expect(await balanceOf(buyerId)).toBe(10_000);
      expect(await balanceOf(sellerId)).toBe(sellerBalanceAfterFee + 50_000);
      expect(await offerRows()).toHaveLength(0);
      const history = await historyRows();
      expect(history).toHaveLength(2);
      expect(history.map((row) => row.role).sort()).toEqual([
        "acceptor",
        "creator",
      ]);
      expect(await auditRows("market-offer-accepted")).toHaveLength(1);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(100);
    });

    it("supports partial fills without duplicating escrow", async () => {
      const offerId = await listSapphires(100, 500);
      await setBalance(buyerId, 60_000);

      const first = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: buyerId,
        amount: 30,
      });
      expect(first.status).toBe("committed");
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(30);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        70,
      );
      expect((await offerRows())[0]?.remaining_amount).toBe(70);

      const overfill = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: buyerId,
        amount: 71,
      });
      expect(overfill.status).toBe("amount-too-large");

      const rest = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: buyerId,
        amount: 70,
      });
      expect(rest.status).toBe("committed");
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect(await offerRows()).toHaveLength(0);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(100);
    });

    it("two buyers racing for one offer fill it exactly once", async () => {
      const offerId = await listSapphires(100, 500);
      const { characterId: rivalId } = await createCharacter("rival");
      await setBalance(buyerId, 50_000);
      await setBalance(rivalId, 50_000);
      const goldBefore = await globalGoldTotal();

      const outcomes = await Promise.allSettled([
        store.acceptSellOffer({
          requestId: randomUUID(),
          offerId,
          buyerCharacterId: buyerId,
          amount: 100,
        }),
        store.acceptSellOffer({
          requestId: randomUUID(),
          offerId,
          buyerCharacterId: rivalId,
          amount: 100,
        }),
      ]);

      const committed = outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" &&
          outcome.value.status === "committed",
      );
      expect(committed).toHaveLength(1);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(100);
      const delivered =
        (await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)) +
        (await itemCountAt(rivalId, "inbox", SAPPHIRE_TYPE));
      expect(delivered).toBe(100);
      expect(await globalGoldTotal()).toBe(goldBefore);
    });

    it("replaying an accept requestId cannot double-fill", async () => {
      const offerId = await listSapphires(100, 500);
      await setBalance(buyerId, 100_000);
      const requestId = randomUUID();

      const first = await store.acceptSellOffer({
        requestId,
        offerId,
        buyerCharacterId: buyerId,
        amount: 30,
      });
      const replay = await store.acceptSellOffer({
        requestId,
        offerId,
        buyerCharacterId: buyerId,
        amount: 30,
      });

      expect(first.status).toBe("committed");
      expect(replay.status).toBe("duplicate-request");
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(30);
      expect(await balanceOf(buyerId)).toBe(85_000);
    });

    it("rejects accepting your own offer and same-account alts", async () => {
      const offerId = await listSapphires(100, 500);
      await setBalance(sellerId, 100_000);
      const { characterId: altId } = await createCharacter(
        "alt",
        sellerAccountId,
      );
      await setBalance(altId, 100_000);

      const own = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: sellerId,
        amount: 100,
      });
      const alt = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: altId,
        amount: 100,
      });

      expect(own.status).toBe("own-offer");
      expect(alt.status).toBe("own-offer");
      expect(await offerRows()).toHaveLength(1);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
    });

    it("commits nothing when the buyer cannot pay", async () => {
      const offerId = await listSapphires(100, 500);
      await setBalance(buyerId, 49_999);

      const result = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: buyerId,
        amount: 100,
      });

      expect(result.status).toBe("insufficient-funds");
      expect(await balanceOf(buyerId)).toBe(49_999);
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(0);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
      expect(await historyRows()).toHaveLength(0);
    });

    it("commits nothing when the buyer inbox is full", async () => {
      const offerId = await listSapphires(100, 500);
      await setBalance(buyerId, 60_000);
      await pool.query(
        `INSERT INTO items (
           id, item_type_id, count, location_type, character_id, slot_index
         )
         SELECT gen_random_uuid(), $2, 1, 'inbox', $1, slot
         FROM generate_series(0, 1999) AS filler(slot)`,
        [buyerId, HELMET_TYPE],
      );

      const result = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: buyerId,
        amount: 100,
      });

      expect(result.status).toBe("inbox-full");
      expect(await balanceOf(buyerId)).toBe(60_000);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
      expect((await offerRows())[0]?.remaining_amount).toBe(100);
    });

    it("cannot accept an expired offer", async () => {
      const offerId = await listSapphires(100, 500);
      await setBalance(buyerId, 60_000);
      await pool.query(
        "UPDATE market_offers SET expires_at = now() - interval '1 minute' WHERE id = $1",
        [offerId],
      );

      const result = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId,
        buyerCharacterId: buyerId,
        amount: 100,
      });

      expect(result.status).toBe("offer-not-found");
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(0);
    });
  });

  describe("accepting buy offers", () => {
    const placeBuyOffer = async (amount: number, unitPrice: number) => {
      await setBalance(buyerId, 1_000_000);
      const result = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, amount, unitPrice),
      );
      if (result.status !== "committed") {
        throw new Error(`buy offer failed: ${result.status}`);
      }
      return result.offerId;
    };

    it("pays the seller from escrowed funds and delivers to the creator", async () => {
      const offerId = await placeBuyOffer(100, 500);
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 0);
      const goldBefore = await globalGoldTotal();

      const result = await store.acceptBuyOffer({
        requestId: randomUUID(),
        offerId,
        sellerCharacterId: sellerId,
        amount: 100,
        sources: await sourcesFor(sellerId, SAPPHIRE_TYPE, 100),
      });

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(await balanceOf(sellerId)).toBe(50_000);
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect(await itemCountAt(sellerId, "depot", SAPPHIRE_TYPE)).toBe(0);
      expect(await offerRows()).toHaveLength(0);
      expect(await globalGoldTotal()).toBe(goldBefore);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(100);
      expect(await ledgerRows(sellerId)).toEqual([
        { entry_type: "market-sale", amount: "50000", balance_after: "50000" },
      ]);
    });

    it("keeps escrow_balance equal to remaining * price on partial fills", async () => {
      const offerId = await placeBuyOffer(100, 500);
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 40, 0);

      const result = await store.acceptBuyOffer({
        requestId: randomUUID(),
        offerId,
        sellerCharacterId: sellerId,
        amount: 40,
        sources: await sourcesFor(sellerId, SAPPHIRE_TYPE, 40),
      });

      expect(result.status).toBe("committed");
      const offers = await offerRows();
      expect(offers[0]?.remaining_amount).toBe(60);
      expect(offers[0]?.escrow_balance).toBe("30000");
      expect(await balanceOf(sellerId)).toBe(20_000);
    });

    it("two sellers racing to fill the remainder cannot overfill", async () => {
      const offerId = await placeBuyOffer(100, 500);
      const { characterId: rivalId } = await createCharacter("rivalseller");
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await insertDepotItem(rivalId, SAPPHIRE_TYPE, 100, 0);
      const goldBefore = await globalGoldTotal();

      const outcomes = await Promise.allSettled([
        (async () =>
          store.acceptBuyOffer({
            requestId: randomUUID(),
            offerId,
            sellerCharacterId: sellerId,
            amount: 100,
            sources: await sourcesFor(sellerId, SAPPHIRE_TYPE, 100),
          }))(),
        (async () =>
          store.acceptBuyOffer({
            requestId: randomUUID(),
            offerId,
            sellerCharacterId: rivalId,
            amount: 100,
            sources: await sourcesFor(rivalId, SAPPHIRE_TYPE, 100),
          }))(),
      ]);

      const committed = outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" &&
          outcome.value.status === "committed",
      );
      expect(committed).toHaveLength(1);
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect(await globalGoldTotal()).toBe(goldBefore);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(200);
      const paidOut =
        (await balanceOf(sellerId)) + (await balanceOf(rivalId));
      expect(paidOut).toBe(50_000);
    });
  });

  describe("cancel and expiry", () => {
    it("returns escrowed items to the owner's inbox on cancel without a fee refund", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      const created = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      expect(created.status).toBe("committed");
      if (created.status !== "committed") return;
      const balanceAfterFee = await balanceOf(sellerId);

      const result = await store.cancelOffer({
        requestId: randomUUID(),
        offerId: created.offerId,
        characterId: sellerId,
      });

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(result.refund).toBe(0);
      expect(await balanceOf(sellerId)).toBe(balanceAfterFee); // fee kept
      expect(await itemCountAt(sellerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect(await escrowRowsOf(sellerId)).toHaveLength(0);
      expect(await offerRows()).toHaveLength(0);
      expect(
        (await historyRows(sellerId)).map((row) => row.state),
      ).toContain("cancelled");
      expect(await auditRows("market-offer-cancelled")).toHaveLength(1);
    });

    it("refunds only the escrow on buy-offer cancel", async () => {
      await setBalance(buyerId, 100_000);
      const created = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 50, 1_000),
      );
      expect(created.status).toBe("committed");
      if (created.status !== "committed") return;

      const result = await store.cancelOffer({
        requestId: randomUUID(),
        offerId: created.offerId,
        characterId: buyerId,
      });

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(result.refund).toBe(50_000);
      expect(await balanceOf(buyerId)).toBe(99_000); // fee 1_000 kept
      expect(await offerRows()).toHaveLength(0);
      const ledger = await ledgerRows(buyerId);
      expect(ledger[ledger.length - 1]?.entry_type).toBe("market-refund");
    });

    it("a non-owner cancel reports not-found and changes nothing", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      const created = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      expect(created.status).toBe("committed");
      if (created.status !== "committed") return;

      const result = await store.cancelOffer({
        requestId: randomUUID(),
        offerId: created.offerId,
        characterId: buyerId,
      });

      expect(result.status).toBe("offer-not-found");
      expect(await offerRows()).toHaveLength(1);
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
    });

    it("cancel racing an accept resolves the offer exactly once", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      await setBalance(buyerId, 60_000);
      const created = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      expect(created.status).toBe("committed");
      if (created.status !== "committed") return;

      const outcomes = await Promise.allSettled([
        store.cancelOffer({
          requestId: randomUUID(),
          offerId: created.offerId,
          characterId: sellerId,
        }),
        store.acceptSellOffer({
          requestId: randomUUID(),
          offerId: created.offerId,
          buyerCharacterId: buyerId,
          amount: 100,
        }),
      ]);

      const committed = outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" &&
          outcome.value.status === "committed",
      );
      expect(committed).toHaveLength(1);
      expect(await offerRows()).toHaveLength(0);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(100);
      // The stock ends wholly in exactly one inbox, never both.
      const sellerInbox = await itemCountAt(sellerId, "inbox", SAPPHIRE_TYPE);
      const buyerInbox = await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE);
      expect([sellerInbox, buyerInbox].sort()).toEqual([0, 100]);
    });

    it("expiry returns sell escrow to the inbox and refunds buy escrow", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      await setBalance(buyerId, 100_000);
      const sell = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      const buy = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 50, 1_000),
      );
      expect(sell.status).toBe("committed");
      expect(buy.status).toBe("committed");
      const buyerBalanceBefore = await balanceOf(buyerId);
      await pool.query(
        "UPDATE market_offers SET expires_at = now() - interval '1 minute'",
      );

      const results = await store.resolveExpired(new Date(), 10);

      expect(results).toHaveLength(2);
      expect(await offerRows()).toHaveLength(0);
      expect(await itemCountAt(sellerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect(await balanceOf(buyerId)).toBe(buyerBalanceBefore + 50_000);
      expect(await auditRows("market-offer-expired")).toHaveLength(2);
      const states = (await historyRows()).map((row) => row.state);
      expect(states.filter((state) => state === "expired")).toHaveLength(2);
    });

    it("expiry replay cannot double-refund", async () => {
      await setBalance(buyerId, 100_000);
      const buy = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 50, 1_000),
      );
      expect(buy.status).toBe("committed");
      await pool.query(
        "UPDATE market_offers SET expires_at = now() - interval '1 minute'",
      );

      const first = await store.resolveExpired(new Date(), 10);
      const second = await store.resolveExpired(new Date(), 10);

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);
      expect(await balanceOf(buyerId)).toBe(99_000);
    });
  });

  describe("escrow isolation from other systems", () => {
    it("mail cannot move an item that is held in market escrow", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      const created = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      expect(created.status).toBe("committed");
      const escrowed = (await escrowRowsOf(sellerId))[0];
      if (!escrowed) throw new Error("escrow row is missing");
      const depotStore = new PgDepotStore(pool, await loadItemCatalog());

      const result = await depotStore.sendMail({
        deliveryKey: `market-test-${randomUUID()}`,
        senderCharacterId: sellerId,
        itemId: escrowed.id,
        itemRevision: 2,
        normalizedRecipientName: "trader buyer",
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      expect(result.status).toBe("not-owned");
      expect(await itemCountAt(sellerId, "market-escrow", SAPPHIRE_TYPE)).toBe(
        100,
      );
    });
  });

  describe("privacy and projections", () => {
    it("own offers and history are filtered to the requesting character", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      await setBalance(buyerId, 100_000);
      const sell = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      expect(sell.status).toBe("committed");
      const buy = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 10, 100),
      );
      expect(buy.status).toBe("committed");

      const sellerOffers = await store.ownOffers(sellerId, 100);
      const buyerOffers = await store.ownOffers(buyerId, 100);
      expect(sellerOffers).toHaveLength(1);
      expect(buyerOffers).toHaveLength(1);
      expect(sellerOffers[0]?.side).toBe("sell");
      expect(buyerOffers[0]?.side).toBe("buy");

      const views = await store.offersForType(SAPPHIRE_TYPE, 100);
      expect(views).toHaveLength(2);
      for (const view of views) {
        expect(Object.keys(view).sort()).toEqual([
          "characterId",
          "expiresAt",
          "id",
          "remainingAmount",
          "side",
          "unitPrice",
        ]);
      }
    });
  });

  describe("conservation under concurrent load", () => {
    it("keeps items and gold conserved across a burst of mixed operations", async () => {
      const { characterId: rivalId } = await createCharacter("mixrival");
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 1);
      await insertDepotItem(rivalId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 100_000);
      await setBalance(buyerId, 200_000);
      await setBalance(rivalId, 100_000);
      const itemsBefore = await globalItemTotal(SAPPHIRE_TYPE);
      const goldBefore = await globalGoldTotal();

      const sellA = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 150, 100),
      );
      expect(sellA.status).toBe("committed");
      if (sellA.status !== "committed") return;
      const buyA = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 80, 200),
      );
      expect(buyA.status).toBe("committed");
      if (buyA.status !== "committed") return;

      const burst = await Promise.allSettled([
        store.acceptSellOffer({
          requestId: randomUUID(),
          offerId: sellA.offerId,
          buyerCharacterId: buyerId,
          amount: 60,
        }),
        store.acceptSellOffer({
          requestId: randomUUID(),
          offerId: sellA.offerId,
          buyerCharacterId: rivalId,
          amount: 120,
        }),
        (async () =>
          store.acceptBuyOffer({
            requestId: randomUUID(),
            offerId: buyA.offerId,
            sellerCharacterId: rivalId,
            amount: 50,
            sources: await sourcesFor(rivalId, SAPPHIRE_TYPE, 50),
          }))(),
        store.cancelOffer({
          requestId: randomUUID(),
          offerId: sellA.offerId,
          characterId: sellerId,
        }),
      ]);

      // Liveness varies (serialization retries are the caller's concern);
      // conservation must not.
      expect(burst.length).toBe(4);
      expect(await globalItemTotal(SAPPHIRE_TYPE)).toBe(itemsBefore);
      expect((await globalGoldTotal()) + (await feesPaid())).toBe(goldBefore);
      for (const offer of await offerRows()) {
        if (offer.side === "buy") {
          expect(Number(offer.escrow_balance)).toBeGreaterThanOrEqual(0);
        } else {
          expect(offer.escrow_balance).toBe("0");
        }
      }
      // Every remaining sell offer is still fully backed by escrow rows.
      const remainingSell = (await offerRows()).filter(
        (offer) => offer.side === "sell",
      );
      for (const offer of remainingSell) {
        const backing = await pool.query<{ total: string | null }>(
          `SELECT SUM(items.count) AS total
           FROM items
           JOIN market_escrow_items ON market_escrow_items.item_id = items.id
           WHERE market_escrow_items.offer_id = $1`,
          [offer.id],
        );
        expect(Number(backing.rows[0]?.total ?? 0)).toBe(
          offer.remaining_amount,
        );
      }
    });
  });

  describe("carried-coin payments", () => {
    it("pays the sell-offer fee from carried coins before the bank", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await insertBackpackItem(sellerId, PLATINUM_TYPE, 6, 0); // 600 gp
      await setBalance(sellerId, 1_000);
      const goldBefore = await systemGoldTotal();

      const result = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500), // fee 1_000
      );

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(await carriedWorthOf(sellerId)).toBe(0);
      expect(await balanceOf(sellerId)).toBe(600); // bank paid only 400
      expect(await ledgerRows(sellerId)).toEqual([
        { entry_type: "market-fee", amount: "400", balance_after: "600" },
      ]);
      expect(result.mutation).toBeDefined();
      expect(await systemGoldTotal()).toBe(goldBefore - 1_000); // fee destroyed
    });

    it("escrows a buy offer from one large coin and grants exact change", async () => {
      await insertBackpackItem(buyerId, CRYSTAL_TYPE, 1, 0); // 10_000 gp
      const goldBefore = await systemGoldTotal();

      const result = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 10, 100), // total 1_000, fee 20
      );

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(await carriedWorthOf(buyerId)).toBe(8_980);
      expect(await balanceOf(buyerId)).toBe(0);
      expect(await ledgerRows(buyerId)).toHaveLength(0); // bank untouched
      expect((await offerRows())[0]?.escrow_balance).toBe("1000");
      expect(result.mutation).toBeDefined();
      expect(await systemGoldTotal()).toBe(goldBefore - 20);
    });

    it("lets a buyer without bank gold accept a sell offer with carried coins", async () => {
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      const listed = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      expect(listed.status).toBe("committed");
      if (listed.status !== "committed") return;
      const sellerBankAfterFee = await balanceOf(sellerId);
      await insertBackpackItem(buyerId, CRYSTAL_TYPE, 5, 0); // 50_000 gp
      const goldBefore = await systemGoldTotal();

      const result = await store.acceptSellOffer({
        requestId: randomUUID(),
        offerId: listed.offerId,
        buyerCharacterId: buyerId,
        amount: 100,
      });

      expect(result.status).toBe("committed");
      if (result.status !== "committed") return;
      expect(await carriedWorthOf(buyerId)).toBe(0);
      expect(await balanceOf(buyerId)).toBe(0);
      expect(await ledgerRows(buyerId)).toHaveLength(0); // no bank leg
      expect(await balanceOf(sellerId)).toBe(sellerBankAfterFee + 50_000);
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect(result.mutation).toBeDefined();
      expect(await systemGoldTotal()).toBe(goldBefore);
    });

    it("two purchases racing the same carried coins spend them once", async () => {
      const { characterId: rivalSellerId } = await createCharacter("coinrace");
      await insertDepotItem(sellerId, SAPPHIRE_TYPE, 100, 0);
      await insertDepotItem(rivalSellerId, SAPPHIRE_TYPE, 100, 0);
      await setBalance(sellerId, 10_000);
      await setBalance(rivalSellerId, 10_000);
      const first = await store.createSellOffer(
        await sellRequest(sellerId, SAPPHIRE_TYPE, 100, 500),
      );
      const second = await store.createSellOffer(
        await sellRequest(rivalSellerId, SAPPHIRE_TYPE, 100, 500),
      );
      expect(first.status).toBe("committed");
      expect(second.status).toBe("committed");
      if (first.status !== "committed" || second.status !== "committed") return;
      await insertBackpackItem(buyerId, CRYSTAL_TYPE, 5, 0); // exactly one fill
      const goldBefore = await systemGoldTotal();

      const outcomes = await Promise.allSettled([
        store.acceptSellOffer({
          requestId: randomUUID(),
          offerId: first.offerId,
          buyerCharacterId: buyerId,
          amount: 100,
        }),
        store.acceptSellOffer({
          requestId: randomUUID(),
          offerId: second.offerId,
          buyerCharacterId: buyerId,
          amount: 100,
        }),
      ]);

      const committed = outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" &&
          outcome.value.status === "committed",
      );
      expect(committed).toHaveLength(1);
      expect(await itemCountAt(buyerId, "inbox", SAPPHIRE_TYPE)).toBe(100);
      expect((await carriedWorthOf(buyerId)) + (await balanceOf(buyerId))).toBe(
        0,
      );
      expect(await systemGoldTotal()).toBe(goldBefore);
    });

    it("rolls back the whole payment when coin change cannot fit", async () => {
      await insertBackpackItem(buyerId, CRYSTAL_TYPE, 1, 0);
      for (let slot = 1; slot < 20; slot++) {
        await insertBackpackItem(buyerId, HELMET_TYPE, 1, slot);
      }
      const goldBefore = await systemGoldTotal();

      const result = await store.createBuyOffer(
        buyRequest(buyerId, SAPPHIRE_TYPE, 10, 100), // needs 8_980 change
      );

      expect(result.status).toBe("no-space");
      expect(await carriedWorthOf(buyerId)).toBe(10_000);
      expect(await offerRows()).toHaveLength(0);
      expect(await ledgerRows(buyerId)).toHaveLength(0);
      expect(await systemGoldTotal()).toBe(goldBefore);
    });
  });
});
