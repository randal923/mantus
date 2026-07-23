import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import type { Item } from "../item/Item";
import { PgTradeStore } from "./PgTradeStore";
import type { TradeCommitInput } from "./TradeStore";

const TEST_SCHEMA = "trade_store_integration";
const MIGRATION_LOCK_KEY = 7_281_007;
/** Leather helmet: non-stackable. */
const HELMET_TYPE = 3355;
const BACKPACK_TYPE = 2854;
const GOLD_TYPE = 3031;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgTradeStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`trade-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Trader ${label}`,
    vocation: "Knight",
    lookType: 128,
  });
  const summaries = await characterStore.listByAccountId(accountId);
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
  return summary.id;
};

const insertReservedItem = async (
  characterId: string,
  typeId: number,
  count: number,
  slot = 0,
): Promise<Item> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, character_id, slot_index
     ) VALUES ($1, $2, $3, 'trade-reservation', $4, $5)`,
    [id, typeId, count, characterId, slot],
  );
  return {
    id,
    typeId,
    count,
    attributes: {},
    version: 1,
    location: { kind: "trade-reservation", characterId, slot },
  };
};

const insertContainedItem = async (
  containerId: string,
  typeId: number,
  count: number,
  slot = 0,
): Promise<Item> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, container_id, slot_index
     ) VALUES ($1, $2, $3, 'container', $4, $5)`,
    [id, typeId, count, containerId, slot],
  );
  return {
    id,
    typeId,
    count,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId, slot },
  };
};

const locationOf = async (itemId: string) => {
  const result = await pool.query<{
    location_type: string;
    character_id: string | null;
    container_id: string | null;
    version: number;
  }>(
    `SELECT location_type, character_id, container_id, version
     FROM items WHERE id = $1`,
    [itemId],
  );
  return result.rows[0] ?? null;
};

/** Total items of a type across every location: dupes/vanishing show up here. */
const globalItemTotal = async (typeId: number): Promise<number> => {
  const result = await pool.query<{ total: string | null }>(
    "SELECT SUM(count) AS total FROM items WHERE item_type_id = $1",
    [typeId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

const rowCountOf = async (itemId: string): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT COUNT(*) AS total FROM items WHERE id = $1",
    [itemId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

const tradeAuditRows = async () => {
  const result = await pool.query<{ character_id: string; details: unknown }>(
    `SELECT character_id, details FROM audit_log
     WHERE event_type = 'item-transferred'
       AND details ? 'trade'
     ORDER BY id`,
  );
  return result.rows;
};

const commitInput = (
  giverA: string,
  itemsA: ReadonlyArray<Item>,
  giverB: string,
  itemsB: ReadonlyArray<Item>,
  capacity = 400,
): TradeCommitInput => ({
  tradeId: randomUUID(),
  legs: [
    {
      giverCharacterId: giverA,
      receiverCharacterId: giverB,
      items: itemsA,
      receiverCapacityMax: capacity,
    },
    {
      giverCharacterId: giverB,
      receiverCharacterId: giverA,
      items: itemsB,
      receiverCapacityMax: capacity,
    },
  ],
});

databaseDescribe("PgTradeStore integration", () => {
  let traderA: string;
  let traderB: string;

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
      "034_unified_action_bar.sql",
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
    store = new PgTradeStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM character_depots");
    await pool.query("DELETE FROM character_storage_state");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    traderA = await createCharacter("alpha");
    traderB = await createCharacter("beta");
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

  it("swaps both legs and appends both audit entries in one transaction", async () => {
    const helmet = await insertReservedItem(traderA, HELMET_TYPE, 1);
    const gold = await insertReservedItem(traderB, GOLD_TYPE, 50);

    const input = commitInput(traderA, [helmet], traderB, [gold]);
    const result = await store.commitTrade(input);

    expect(result.status).toBe("committed");
    expect((await locationOf(helmet.id))?.character_id ?? "").not.toBe(traderA);
    const helmetRow = await locationOf(helmet.id);
    const goldRow = await locationOf(gold.id);
    // Each root landed on the receiver's equipped backpack.
    expect(helmetRow?.location_type).toBe("container");
    expect(goldRow?.location_type).toBe("container");
    expect(await globalItemTotal(HELMET_TYPE)).toBe(1);
    expect(await globalItemTotal(GOLD_TYPE)).toBe(50);
    const audits = await tradeAuditRows();
    expect(audits).toHaveLength(2);
    expect(audits.map((row) => row.character_id).sort()).toEqual(
      [traderA, traderB].sort(),
    );
  });

  it("delivers a reserved container with its nested contents intact", async () => {
    const backpack = await insertReservedItem(traderA, BACKPACK_TYPE, 1);
    const nested = await insertContainedItem(backpack.id, HELMET_TYPE, 1);
    const gold = await insertReservedItem(traderB, GOLD_TYPE, 50);

    const result = await store.commitTrade(
      commitInput(traderA, [backpack, nested], traderB, [gold]),
    );

    expect(result.status).toBe("committed");
    const nestedRow = await locationOf(nested.id);
    expect(nestedRow?.location_type).toBe("container");
    expect(nestedRow?.container_id).toBe(backpack.id);
    expect(await globalItemTotal(HELMET_TYPE)).toBe(1);
  });

  it("commits exactly once when two commits race the same reserved items", async () => {
    const helmet = await insertReservedItem(traderA, HELMET_TYPE, 1);
    const gold = await insertReservedItem(traderB, GOLD_TYPE, 50);

    const input = commitInput(traderA, [helmet], traderB, [gold]);
    const results = await Promise.allSettled([
      store.commitTrade(input),
      store.commitTrade({ ...input, tradeId: randomUUID() }),
    ]);

    const committed = results.filter(
      (outcome) =>
        outcome.status === "fulfilled" &&
        outcome.value.status === "committed",
    );
    expect(committed.length).toBe(1);
    expect(await globalItemTotal(HELMET_TYPE)).toBe(1);
    expect(await globalItemTotal(GOLD_TYPE)).toBe(50);
    expect(await rowCountOf(helmet.id)).toBe(1);
    expect(await tradeAuditRows()).toHaveLength(2);
  });

  it("rolls back the first leg when the second leg fails verification", async () => {
    const helmet = await insertReservedItem(traderA, HELMET_TYPE, 1);
    const gold = await insertReservedItem(traderB, GOLD_TYPE, 50);
    // Stale version on leg two: something already moved the reserved stack.
    const staleGold = { ...gold, version: 99 };

    const result = await store.commitTrade(
      commitInput(traderA, [helmet], traderB, [staleGold]),
    );

    expect(result.status).toBe("failed");
    // Leg one's move and audit rolled back with it — commit or nothing.
    expect((await locationOf(helmet.id))?.location_type).toBe(
      "trade-reservation",
    );
    expect((await locationOf(gold.id))?.location_type).toBe(
      "trade-reservation",
    );
    expect(await tradeAuditRows()).toHaveLength(0);
  });

  it("aborts the whole swap when a receiver lacks capacity", async () => {
    const helmet = await insertReservedItem(traderA, HELMET_TYPE, 1);
    const gold = await insertReservedItem(traderB, GOLD_TYPE, 50);

    const result = await store.commitTrade(
      commitInput(traderA, [helmet], traderB, [gold], 0),
    );

    expect(result.status).toBe("no-capacity");
    expect((await locationOf(helmet.id))?.location_type).toBe(
      "trade-reservation",
    );
    expect((await locationOf(gold.id))?.location_type).toBe(
      "trade-reservation",
    );
    expect(await tradeAuditRows()).toHaveLength(0);
  });

  it("loads reservation roots with their nested contents for login recovery", async () => {
    const backpack = await insertReservedItem(traderA, BACKPACK_TYPE, 1);
    const nested = await insertContainedItem(backpack.id, HELMET_TYPE, 1);
    await insertReservedItem(traderB, GOLD_TYPE, 50);

    const reserved = await store.loadReservations(traderA);

    expect(reserved.map((item) => item.id).sort()).toEqual(
      [backpack.id, nested.id].sort(),
    );
    expect(
      reserved.find((item) => item.id === backpack.id)?.location.kind,
    ).toBe("trade-reservation");
  });
});
