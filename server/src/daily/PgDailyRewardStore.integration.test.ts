import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
import { PgDailyRewardStore } from "./PgDailyRewardStore";
import type { DailyClaimRequest } from "./DailyRewardStore";

const TEST_SCHEMA = "daily_reward_integration";
const MIGRATION_LOCK_KEY = 7_281_085;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

const BACKPACK = 2_854;
const HEALTH_POTION = 266;
const NOW = 1_700_000_000_000;

let setupClient: Client;
let pool: Pool;
let store: PgDailyRewardStore;
let characterId: string;

const claim = (
  overrides: Partial<DailyClaimRequest> = {},
): DailyClaimRequest => ({
  characterId,
  todayKey: "2026-07-26",
  expectedRewardDay: 1,
  kind: "vocation-items",
  allowance: 5,
  items: [
    { typeId: HEALTH_POTION, count: 5, stackable: true, maxCount: 100 },
  ],
  wildcards: 0,
  xpBoostMinutes: 0,
  nowMs: NOW,
  ...overrides,
});

databaseDescribe("PgDailyRewardStore integration", () => {
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
    store = new PgDailyRewardStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_daily_rewards");
    await pool.query("DELETE FROM character_daily_reward_history");
    await pool.query("DELETE FROM character_prey_resources");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ($1, 'en') RETURNING id`,
      [`daily-${randomUUID()}`],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error("account insert returned no id");
    characterId = randomUUID();
    await pool.query(
      `INSERT INTO characters (
         id, account_id, display_name, normalized_name, vocation,
         health, mana, position_x, position_y, position_z, direction,
         outfit_look_type, outfit_head, outfit_body, outfit_legs,
         outfit_feet, town_id
       ) VALUES (
         $1, $2, 'Daily Hero', 'daily hero', 'Knight',
         150, 50, 100, 100, 7, 'south', 128, 1, 1, 1, 1, 1
       )`,
      [characterId, accountId],
    );
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, character_id, equipment_slot
       ) VALUES (gen_random_uuid(), $1, 1, 'equipment', $2, 'backpack')`,
      [BACKPACK, characterId],
    );
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

  it("claims exactly once per day under concurrent intents", async () => {
    const [first, second] = await Promise.all([
      store.claim(claim()),
      store.claim(claim()),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["already-claimed", "committed"]);
    // Granted rows live in the backpack container chain (character_id is
    // NULL on container rows by schema shape).
    const potions = await pool.query<{ total: string | null }>(
      `SELECT sum(count)::text AS total FROM items WHERE item_type_id = $1`,
      [HEALTH_POTION],
    );
    expect(Number(potions.rows[0]?.total ?? 0)).toBe(5);
    const audits = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM audit_log
       WHERE event_type = 'daily-reward-claim'`,
    );
    expect(Number(audits.rows[0]?.total)).toBe(1);
    // The history row rides the same transaction, so the loser of the race
    // leaves no entry behind either.
    const history = await store.history(characterId, 15);
    expect(history).toEqual([
      {
        claimedAtMs: NOW,
        rewardDay: 1,
        kind: "vocation-items",
        allowance: 5,
        items: [{ typeId: HEALTH_POTION, count: 5 }],
      },
    ]);
  });

  it("keeps history newest first, capped, and scoped to its own character", async () => {
    const days = ["2026-07-26", "2026-07-27", "2026-07-28"];
    for (const [index, todayKey] of days.entries()) {
      const result = await store.claim(
        claim({
          todayKey,
          expectedRewardDay: index + 1,
          nowMs: NOW + index * 86_400_000,
          ...(index === 2
            ? { kind: "wildcards" as const, allowance: 1, items: [], wildcards: 1 }
            : {}),
        }),
      );
      expect(result.status).toBe("committed");
    }

    const newestFirst = await store.history(characterId, 15);
    expect(newestFirst.map((entry) => entry.rewardDay)).toEqual([3, 2, 1]);
    expect(newestFirst[0]).toMatchObject({ kind: "wildcards", items: [] });
    expect(await store.history(characterId, 2)).toHaveLength(2);

    // A different character sees none of it (charter rule 6).
    const other = await pool.query<{ id: string }>(
      `INSERT INTO characters (
         id, account_id, display_name, normalized_name, vocation,
         health, mana, position_x, position_y, position_z, direction,
         outfit_look_type, outfit_head, outfit_body, outfit_legs,
         outfit_feet, town_id
       )
       SELECT gen_random_uuid(), account_id, 'Other Hero', 'other hero',
              'Knight', 150, 50, 100, 100, 7, 'south', 128, 1, 1, 1, 1, 1
       FROM characters WHERE id = $1
       RETURNING id`,
      [characterId],
    );
    const otherId = other.rows[0]?.id;
    if (!otherId) throw new Error("second character insert returned no id");
    expect(await store.history(otherId, 15)).toEqual([]);
  });

  it("writes no history row when the claim rolls back", async () => {
    const stale = await store.claim(claim({ expectedRewardDay: 4 }));
    expect(stale.status).toBe("stale");
    expect(await store.history(characterId, 15)).toEqual([]);
  });

  it("advances the streak on the next day and pays the next reward day", async () => {
    const first = await store.claim(claim());
    expect(first.status).toBe("committed");
    const second = await store.claim(
      claim({ todayKey: "2026-07-27", expectedRewardDay: 2 }),
    );
    expect(second.status).toBe("committed");
    if (second.status !== "committed") return;
    expect(second.state.streakPosition).toBe(2);
    expect(second.state.streakLevel).toBe(2);
  });

  it("aborts on a stale projected reward day without any grant", async () => {
    await store.claim(claim());
    const stale = await store.claim(
      claim({ todayKey: "2026-07-27", expectedRewardDay: 5 }),
    );
    expect(stale.status).toBe("stale");
    const rows = await pool.query<{ streak_level: number }>(
      `SELECT streak_level FROM character_daily_rewards WHERE character_id = $1`,
      [characterId],
    );
    expect(rows.rows[0]?.streak_level).toBe(1);
  });

  it("grants capped wildcards and audits them in the claim transaction", async () => {
    await pool.query(
      `INSERT INTO character_prey_resources (character_id, wildcards)
       VALUES ($1, 49)`,
      [characterId],
    );
    const result = await store.claim(
      claim({ items: [], wildcards: 2, expectedRewardDay: 1 }),
    );
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.wildcardsAfter).toBe(50);
    const audits = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM audit_log
       WHERE event_type = 'prey-wildcard-grant'`,
    );
    expect(Number(audits.rows[0]?.total)).toBe(1);
  });

  it("extends the XP boost deadline from the later of now or the old deadline", async () => {
    const first = await store.claim(
      claim({ items: [], xpBoostMinutes: 10 }),
    );
    expect(first.status).toBe("committed");
    if (first.status !== "committed") return;
    expect(first.state.xpBoostUntilMs).toBe(NOW + 10 * 60_000);
    const second = await store.claim(
      claim({
        todayKey: "2026-07-27",
        expectedRewardDay: 2,
        items: [],
        xpBoostMinutes: 30,
        nowMs: NOW + 5 * 60_000,
      }),
    );
    expect(second.status).toBe("committed");
    if (second.status !== "committed") return;
    // Remaining boost stacks: old deadline + 30 more minutes.
    expect(second.state.xpBoostUntilMs).toBe(NOW + 40 * 60_000);
  });
});
