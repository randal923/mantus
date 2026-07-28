import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { applyMigrations } from "../test/applyMigrations";
import type { TaskSlotRecord } from "./HuntingTaskStore";
import { PgHuntingTaskStore } from "./PgHuntingTaskStore";

const TEST_SCHEMA = "hunting_task_store_integration";
const MIGRATION_LOCK_KEY = 7_281_006;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgHuntingTaskStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`task-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Tasker ${label}`,
    vocation: "Knight",
    sex: "male",
  });
  const summary = (await characterStore.listByAccountId(accountId))[0];
  if (!summary) throw new Error("character was not created");
  return summary.id;
};

const setBalance = async (
  characterId: string,
  balance: number,
): Promise<void> => {
  await pool.query(
    `INSERT INTO bank_accounts (character_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO UPDATE SET balance = $2`,
    [characterId, balance],
  );
};

const makeSlot = (overrides: Partial<TaskSlotRecord> = {}): TaskSlotRecord => ({
  slot: 0,
  state: "selection",
  grid: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  selectedRaceId: null,
  upgrade: false,
  rarity: 1,
  kills: 0,
  disabledUntilMs: 0,
  freeRerollAtMs: 0,
  ...overrides,
});

/** Serializable races may also surface as thrown 40001s; treat as failure. */
const settle = async (
  operation: Promise<{ status: string }>,
): Promise<string> => operation.then((r) => r.status).catch(() => "conflict");

databaseDescribe("PgHuntingTaskStore integration", () => {
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
    characterStore = new PgCharacterStore(pool);
    characterService = new CharacterService(characterStore, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    });
    store = new PgHuntingTaskStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_task_slots");
    await pool.query("DELETE FROM character_prey_resources");
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
    await pool?.end();
    await setupClient?.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient?.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient?.end();
  });

  it("racing claims grant the points exactly once", async () => {
    await store.initialize(characterId, [
      makeSlot({ state: "completed", selectedRaceId: 7, kills: 30 }),
    ]);
    const erased = makeSlot({
      state: "inactive",
      grid: [11, 12, 13, 14, 15, 16, 17, 18, 19],
      rarity: 2,
      disabledUntilMs: 999_999,
      freeRerollAtMs: 111,
    });

    const results = await Promise.all([
      settle(
        store.claimTask(
          characterId,
          { slot: 0, raceId: 7, minKills: 25 },
          10,
          erased,
        ),
      ),
      settle(
        store.claimTask(
          characterId,
          { slot: 0, raceId: 7, minKills: 25 },
          10,
          erased,
        ),
      ),
    ]);

    expect(results.filter((status) => status === "committed")).toHaveLength(1);
    const resources = await pool.query<{ task_points: string }>(
      "SELECT task_points FROM character_prey_resources WHERE character_id = $1",
      [characterId],
    );
    expect(Number(resources.rows[0]?.task_points)).toBe(10);
    const audit = await pool.query(
      "SELECT * FROM audit_log WHERE character_id = $1 AND event_type = 'hunting-task-claim'",
      [characterId],
    );
    expect(audit.rowCount).toBe(1);
    const slot = await pool.query<{ state: string; kills: number }>(
      "SELECT state, kills FROM character_task_slots WHERE character_id = $1 AND slot = 0",
      [characterId],
    );
    expect(slot.rows[0]?.state).toBe("inactive");
    expect(slot.rows[0]?.kills).toBe(0);
  });

  it("rejects a claim whose kills fall short of the durable row", async () => {
    await store.initialize(characterId, [
      makeSlot({ state: "active", selectedRaceId: 7, kills: 10 }),
    ]);
    const result = await store.claimTask(
      characterId,
      { slot: 0, raceId: 7, minKills: 25 },
      10,
      makeSlot({ state: "inactive" }),
    );
    expect(result.status).toBe("not-claimable");
    const resources = await pool.query<{ task_points: string }>(
      "SELECT task_points FROM character_prey_resources WHERE character_id = $1",
      [characterId],
    );
    expect(Number(resources.rows[0]?.task_points ?? 0)).toBe(0);
  });

  it("charges gold with ledger and audit rows for cancel", async () => {
    await store.initialize(characterId, [
      makeSlot({ state: "active", selectedRaceId: 7, kills: 3 }),
    ]);
    await setBalance(characterId, 12_000);

    const result = await store.chargeGold(
      characterId,
      10_000,
      makeSlot({ rarity: 3 }),
      "cancel",
    );
    expect(result.status).toBe("committed");
    const ledger = await pool.query(
      "SELECT * FROM bank_ledger WHERE character_id = $1 AND entry_type = 'hunting-task-cancel'",
      [characterId],
    );
    expect(ledger.rowCount).toBe(1);
    const audit = await pool.query(
      "SELECT * FROM audit_log WHERE character_id = $1 AND event_type = 'hunting-task-cancel'",
      [characterId],
    );
    expect(audit.rowCount).toBe(1);
    const snapshot = await store.load(characterId);
    expect(snapshot?.slots[0]?.rarity).toBe(3);
    expect(snapshot?.slots[0]?.selectedRaceId).toBeNull();
  });

  it("persists and restores the full slot shape", async () => {
    await store.initialize(characterId, [
      makeSlot({
        slot: 0,
        state: "active",
        selectedRaceId: 21,
        upgrade: true,
        rarity: 4,
        kills: 123,
        disabledUntilMs: 5_000,
        freeRerollAtMs: 6_000,
      }),
    ]);
    const snapshot = await store.load(characterId);
    expect(snapshot?.slots[0]).toMatchObject({
      state: "active",
      selectedRaceId: 21,
      upgrade: true,
      rarity: 4,
      kills: 123,
      disabledUntilMs: 5_000,
      freeRerollAtMs: 6_000,
    });
    expect(snapshot?.taskPoints).toBe(0);
  });
});
