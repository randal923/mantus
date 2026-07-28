import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { FORGE_RULES } from "@tibia/protocol";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import type { ItemCatalog } from "../item/ItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
import { PgForgeStore } from "./PgForgeStore";
import type { ForgeExchangeRequest } from "./ForgeStore";

const TEST_SCHEMA = "forge_store_integration";
const MIGRATION_LOCK_KEY = 7_281_009;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let catalog: ItemCatalog;
let store: PgForgeStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const SWORD_TYPE_ID = 3273;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`forge-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Forger ${label}`,
    vocation: "Knight",
    sex: "male",
  });
  const summary = (await characterStore.listByAccountId(accountId))[0];
  if (!summary) throw new Error("character was not created");
  return summary.id;
};

const setBalance = async (characterId: string, balance: number) => {
  await pool.query(
    `INSERT INTO bank_accounts (character_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO UPDATE SET balance = $2`,
    [characterId, balance],
  );
};

const setDusts = async (characterId: string, dusts: number) => {
  await pool.query(
    `INSERT INTO character_forge_resources (character_id, dusts, dust_level)
     VALUES ($1, $2, 225)
     ON CONFLICT (character_id) DO UPDATE SET dusts = $2, dust_level = 225`,
    [characterId, dusts],
  );
};

const seedCarriedItem = async (
  characterId: string,
  slotIndex: number,
  tier: number,
): Promise<{ id: string; version: number }> => {
  const backpack = await pool.query<{ id: string }>(
    `SELECT id FROM items
     WHERE character_id = $1 AND location_type = 'equipment'
       AND equipment_slot = 'backpack'`,
    [characterId],
  );
  const backpackId = backpack.rows[0]?.id;
  if (!backpackId) throw new Error("character has no starter backpack");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, attributes, location_type, container_id,
       slot_index
     ) VALUES ($1, $2, 1, $3::jsonb, 'container', $4, $5)`,
    [
      id,
      SWORD_TYPE_ID,
      JSON.stringify(tier > 0 ? { tier } : {}),
      backpackId,
      slotIndex,
    ],
  );
  return { id, version: 1 };
};

const fusionRequest = (
  first: { id: string; version: number },
  second: { id: string; version: number },
): ForgeExchangeRequest => ({
  action: "fusion",
  changes: [
    { itemId: first.id, expectedVersion: first.version, newTier: 1 },
  ],
  destroyItems: [{ itemId: second.id, expectedVersion: second.version }],
  coreCost: 0,
  dustCost: FORGE_RULES.fusionDustCost,
  goldCost: 25_000,
  history: {
    action: "fusion",
    convergence: false,
    success: true,
    bonus: 0,
    tier: 1,
    description: "sabre (tier 0 -> 1)",
    costGold: 25_000,
    costDust: FORGE_RULES.fusionDustCost,
    costCores: 0,
    gained: 0,
  },
});

databaseDescribe("PgForgeStore integration (Feature 78)", () => {
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
    characterStore = new PgCharacterStore(pool);
    characterService = new CharacterService(characterStore, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    });
    store = new PgForgeStore(pool, catalog);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM forge_history");
    await pool.query("DELETE FROM character_forge_resources");
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    characterId = await createCharacter("alpha");
    await setBalance(characterId, 1_000_000);
    await setDusts(characterId, 200);
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("commits a fusion atomically: tier write, destruction, dust, gold, history, audit", async () => {
    const first = await seedCarriedItem(characterId, 10, 0);
    const second = await seedCarriedItem(characterId, 11, 0);
    const result = await store.exchange(
      characterId,
      fusionRequest(first, second),
    );
    expect(result.status).toBe("committed");
    const items = await pool.query(
      `SELECT id, attributes, version FROM items WHERE id = ANY($1)`,
      [[first.id, second.id]],
    );
    expect(items.rowCount).toBe(1);
    expect(items.rows[0]).toMatchObject({
      id: first.id,
      attributes: { tier: 1 },
      version: 2,
    });
    const resources = await pool.query(
      `SELECT dusts FROM character_forge_resources WHERE character_id = $1`,
      [characterId],
    );
    expect(resources.rows[0]?.dusts).toBe(200 - FORGE_RULES.fusionDustCost);
    const balance = await pool.query(
      `SELECT balance FROM bank_accounts WHERE character_id = $1`,
      [characterId],
    );
    expect(Number(balance.rows[0]?.balance)).toBe(975_000);
    // History and audit land one-to-one in the same transaction.
    const history = await pool.query(
      `SELECT count(*)::int AS total FROM forge_history WHERE character_id = $1`,
      [characterId],
    );
    expect(history.rows[0]?.total).toBe(1);
    const audit = await pool.query(
      `SELECT count(*)::int AS total FROM audit_log
       WHERE character_id = $1 AND event_type = 'forge-fusion'`,
      [characterId],
    );
    expect(audit.rows[0]?.total).toBe(1);
  });

  it("leaves nothing behind when the gold leg fails", async () => {
    await setBalance(characterId, 10);
    const first = await seedCarriedItem(characterId, 10, 0);
    const second = await seedCarriedItem(characterId, 11, 0);
    const result = await store.exchange(
      characterId,
      fusionRequest(first, second),
    );
    expect(result.status).toBe("insufficient-gold");
    const items = await pool.query(
      `SELECT id, attributes FROM items WHERE id = ANY($1) ORDER BY id`,
      [[first.id, second.id]],
    );
    expect(items.rowCount).toBe(2);
    for (const row of items.rows) expect(row.attributes).toEqual({});
    const resources = await pool.query(
      `SELECT dusts FROM character_forge_resources WHERE character_id = $1`,
      [characterId],
    );
    expect(resources.rows[0]?.dusts).toBe(200);
    const history = await pool.query(
      `SELECT count(*)::int AS total FROM forge_history WHERE character_id = $1`,
      [characterId],
    );
    expect(history.rows[0]?.total).toBe(0);
  });

  it("racing fusions over the same second item leave exactly one winner", async () => {
    const first = await seedCarriedItem(characterId, 10, 0);
    const second = await seedCarriedItem(characterId, 11, 0);
    const [left, right] = await Promise.all([
      store
        .exchange(characterId, fusionRequest(first, second))
        .then((result) => result.status)
        .catch(() => "conflict"),
      store
        .exchange(characterId, fusionRequest(first, second))
        .then((result) => result.status)
        .catch(() => "conflict"),
    ]);
    const committed = [left, right].filter(
      (status) => status === "committed",
    ).length;
    expect(committed).toBe(1);
    // Conservation: exactly one surviving item at tier 1, one dust debit,
    // one gold debit, one history row.
    const items = await pool.query(
      `SELECT count(*)::int AS total FROM items WHERE id = ANY($1)`,
      [[first.id, second.id]],
    );
    expect(items.rows[0]?.total).toBe(1);
    const resources = await pool.query(
      `SELECT dusts FROM character_forge_resources WHERE character_id = $1`,
      [characterId],
    );
    expect(resources.rows[0]?.dusts).toBe(200 - FORGE_RULES.fusionDustCost);
    const balance = await pool.query(
      `SELECT balance FROM bank_accounts WHERE character_id = $1`,
      [characterId],
    );
    expect(Number(balance.rows[0]?.balance)).toBe(975_000);
    const history = await pool.query(
      `SELECT count(*)::int AS total FROM forge_history WHERE character_id = $1`,
      [characterId],
    );
    expect(history.rows[0]?.total).toBe(1);
  });

  it("racing dust conversions conserve the dust balance", async () => {
    const conversion = {
      conversion: "dust-to-slivers" as const,
      history: {
        action: "dust-to-slivers" as const,
        convergence: false,
        success: true,
        bonus: 0,
        tier: 0,
        description: "60 dust -> 3 slivers",
        costGold: 0,
        costDust: 60,
        costCores: 0,
        gained: 3,
      },
    };
    // Minted slivers land in the starter backpack.
    await setDusts(characterId, 100);
    const statuses = await Promise.all([
      store
        .conversion(characterId, conversion)
        .then((result) => result.status)
        .catch(() => "conflict"),
      store
        .conversion(characterId, conversion)
        .then((result) => result.status)
        .catch(() => "conflict"),
      store
        .conversion(characterId, conversion)
        .then((result) => result.status)
        .catch(() => "conflict"),
    ]);
    const committed = statuses.filter((status) => status === "committed").length;
    // 100 dust affords one conversion; retries surface as conflicts or
    // insufficient-dust, never a negative balance.
    expect(committed).toBeLessThanOrEqual(1);
    const resources = await pool.query(
      `SELECT dusts FROM character_forge_resources WHERE character_id = $1`,
      [characterId],
    );
    expect(resources.rows[0]?.dusts).toBe(100 - committed * 60);
    const slivers = await pool.query(
      `SELECT coalesce(sum(count), 0)::int AS total FROM items
       WHERE character_id IS NULL AND item_type_id = $1
          OR character_id = $2 AND item_type_id = $1`,
      [FORGE_RULES.sliverItemTypeId, characterId],
    );
    void slivers;
    const allSlivers = await pool.query(
      `WITH RECURSIVE owned AS (
         SELECT i.* FROM items i
         WHERE i.character_id = $1 AND i.location_type = 'equipment'
         UNION ALL
         SELECT child.* FROM items child
         JOIN owned ON child.container_id = owned.id
       )
       SELECT coalesce(sum(count) FILTER (WHERE item_type_id = $2), 0)::int AS total
       FROM owned`,
      [characterId, FORGE_RULES.sliverItemTypeId],
    );
    expect(allSlivers.rows[0]?.total).toBe(committed * 3);
  });
});
