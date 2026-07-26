import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
import { PgRewardStore } from "./PgRewardStore";
import type { RewardGrantRequest } from "./RewardStore";

const TEST_SCHEMA = "reward_chest_integration";
const MIGRATION_LOCK_KEY = 7_281_084;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

const BACKPACK = 2_854;
const GOLD_COIN = 3_031;
const PLATE_ARMOR = 3_357;
const DAY_MS = 86_400_000;
const NOW = 1_700_000_000_000;

let setupClient: Client;
let pool: Pool;
let store: PgRewardStore;
let characterId: string;
let otherCharacterId: string;

const grant = (
  overrides: Partial<RewardGrantRequest> = {},
): RewardGrantRequest => ({
  grantKey: `boss-reward:${randomUUID()}:${characterId}`,
  recipientCharacterId: characterId,
  bossName: "Grand Master Oberon",
  createdAtMs: NOW,
  items: [
    { typeId: GOLD_COIN, count: 50 },
    { typeId: PLATE_ARMOR, count: 1 },
  ],
  ...overrides,
});

const itemCount = async (): Promise<number> => {
  const rows = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM items`,
  );
  return Number(rows.rows[0]?.total ?? 0);
};

databaseDescribe("PgRewardStore integration", () => {
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
    store = new PgRewardStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM reward_grants");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ($1, 'en') RETURNING id`,
      [`reward-${randomUUID()}`],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error("account insert returned no id");
    characterId = randomUUID();
    otherCharacterId = randomUUID();
    for (const [id, name] of [
      [characterId, "Reward Hero"],
      [otherCharacterId, "Reward Rival"],
    ] as const) {
      await pool.query(
        `INSERT INTO characters (
           id, account_id, display_name, normalized_name, vocation,
           health, mana, position_x, position_y, position_z, direction,
           outfit_look_type, outfit_head, outfit_body, outfit_legs,
           outfit_feet, town_id
         ) VALUES (
           $1, $2, $3, $4, 'Knight',
           150, 50, 100, 100, 7, 'south', 128, 1, 1, 1, 1, 1
         )`,
        [id, accountId, name, name.toLowerCase()],
      );
      await pool.query(
        `INSERT INTO items (
           id, item_type_id, count, location_type, character_id, equipment_slot
         ) VALUES (gen_random_uuid(), $1, 1, 'equipment', $2, 'backpack')`,
        [BACKPACK, id],
      );
    }
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient.query("SET search_path TO public");
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("grants exactly once per key under a concurrent replay", async () => {
    const request = grant();
    const [first, second] = await Promise.all([
      store.grantBossRewards(request),
      store.grantBossRewards(request),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["duplicate", "granted"]);
    const chest = await store.loadRewardChest(characterId, NOW);
    expect(chest.bags).toHaveLength(1);
    expect(chest.bags[0]!.items).toHaveLength(2);
    const audits = await pool.query(
      `SELECT count(*)::text AS total FROM audit_log
       WHERE event_type = 'boss-reward'`,
    );
    expect(Number(audits.rows[0]?.total)).toBe(1);
  });

  it("claims empty grants so a crash replay cannot re-roll them", async () => {
    const request = grant({ items: [] });
    expect((await store.grantBossRewards(request)).status).toBe("granted");
    expect((await store.grantBossRewards(request)).status).toBe("duplicate");
    expect((await store.loadRewardChest(characterId, NOW)).bags).toEqual([]);
  });

  it("deletes expired bags on open (7 days) and audits the drop", async () => {
    await store.grantBossRewards(
      grant({ createdAtMs: NOW - 8 * DAY_MS }),
    );
    await store.grantBossRewards(grant());
    const chest = await store.loadRewardChest(characterId, NOW);
    expect(chest.bags).toHaveLength(1);
    expect(chest.bags[0]!.createdAtMs).toBe(NOW);
    const audits = await pool.query(
      `SELECT count(*)::text AS total FROM audit_log
       WHERE event_type = 'reward-expired'`,
    );
    expect(Number(audits.rows[0]?.total)).toBe(1);
  });

  it("collects a single item, then the rest, deleting the emptied bag", async () => {
    await store.grantBossRewards(grant());
    const chest = await store.loadRewardChest(characterId, NOW);
    const bag = chest.bags[0]!;
    const single = await store.collect(
      characterId,
      bag.bagId,
      bag.items[0]!.itemId,
      NOW,
    );
    expect(single.status).toBe("committed");
    if (single.status !== "committed") return;
    expect(single.mutation.after).toHaveLength(1);
    expect(single.state.bags[0]!.items).toHaveLength(1);
    const rest = await store.collect(characterId, bag.bagId, null, NOW);
    expect(rest.status).toBe("committed");
    if (rest.status !== "committed") return;
    expect(rest.state.bags).toEqual([]);
    const rows = await pool.query<{ location_type: string }>(
      `SELECT location_type FROM items WHERE id = $1`,
      [bag.items[0]!.itemId],
    );
    expect(rows.rows[0]?.location_type).toBe("container");
  });

  it("a concurrent double-collect of one item conserves it", async () => {
    await store.grantBossRewards(grant({ items: [{ typeId: PLATE_ARMOR, count: 1 }] }));
    const chest = await store.loadRewardChest(characterId, NOW);
    const bag = chest.bags[0]!;
    const before = await itemCount();
    const results = await Promise.all([
      store.collect(characterId, bag.bagId, bag.items[0]!.itemId, NOW),
      store.collect(characterId, bag.bagId, bag.items[0]!.itemId, NOW),
    ]);
    const committed = results.filter((r) => r.status === "committed");
    expect(committed).toHaveLength(1);
    // One row moved, the emptied bag row deleted — never a duplicate item.
    expect(await itemCount()).toBe(before - 1);
    const armors = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM items WHERE item_type_id = $1`,
      [PLATE_ARMOR],
    );
    expect(Number(armors.rows[0]?.total)).toBe(1);
  });

  it("never serves another character's bag", async () => {
    await store.grantBossRewards(grant());
    const chest = await store.loadRewardChest(characterId, NOW);
    const result = await store.collect(
      otherCharacterId,
      chest.bags[0]!.bagId,
      null,
      NOW,
    );
    expect(result.status).toBe("not-found");
    expect((await store.loadRewardChest(characterId, NOW)).bags).toHaveLength(1);
  });
});
