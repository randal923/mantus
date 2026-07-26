import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { applyMigrations } from "../test/applyMigrations";
import { PgPreyStore } from "./PgPreyStore";
import type { PreySlotRecord } from "./PreyStore";

const TEST_SCHEMA = "prey_store_integration";
const MIGRATION_LOCK_KEY = 7_281_005;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgPreyStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`prey-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Preyer ${label}`,
    vocation: "Knight",
    lookType: 128,
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

const setWildcards = async (
  characterId: string,
  wildcards: number,
): Promise<void> => {
  await pool.query(
    `INSERT INTO character_prey_resources (character_id, wildcards)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO UPDATE SET wildcards = $2`,
    [characterId, wildcards],
  );
};

const makeSlot = (overrides: Partial<PreySlotRecord> = {}): PreySlotRecord => ({
  slot: 0,
  state: "selection",
  grid: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  selectedRaceId: null,
  bonusType: null,
  bonusRarity: 1,
  bonusPercentage: 5,
  bonusTimeLeftSeconds: 0,
  freeRerollAtMs: 0,
  option: "none",
  ...overrides,
});

/** Serializable races may also surface as thrown 40001s; treat as failure. */
const settle = async (
  operation: Promise<{ status: string }>,
): Promise<string> => operation.then((r) => r.status).catch(() => "conflict");

databaseDescribe("PgPreyStore integration", () => {
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
    store = new PgPreyStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_prey_slots");
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

  it("initializes and loads slots with resources", async () => {
    await store.initialize(characterId, [
      makeSlot({ slot: 0 }),
      makeSlot({ slot: 1, state: "locked", grid: [] }),
      makeSlot({ slot: 2, state: "locked", grid: [] }),
    ]);
    const snapshot = await store.load(characterId);
    expect(snapshot?.slots).toHaveLength(3);
    expect(snapshot?.slots[0]?.grid).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(snapshot?.wildcards).toBe(0);
  });

  it("racing paid rerolls debit exactly once when funds cover one", async () => {
    await store.initialize(characterId, [makeSlot()]);
    await setBalance(characterId, 10_000);
    const record = makeSlot({ grid: [11, 12, 13, 14, 15, 16, 17, 18, 19] });

    const [first, second] = await Promise.all([
      settle(store.chargeListReroll(characterId, 10_000, record)),
      settle(store.chargeListReroll(characterId, 10_000, record)),
    ]);

    const committed = [first, second].filter(
      (status) => status === "committed",
    );
    expect(committed).toHaveLength(1);
    const balance = await pool.query<{ balance: string }>(
      "SELECT balance FROM bank_accounts WHERE character_id = $1",
      [characterId],
    );
    expect(Number(balance.rows[0]?.balance)).toBe(0);
    const ledger = await pool.query(
      "SELECT * FROM bank_ledger WHERE character_id = $1 AND entry_type = 'prey-reroll'",
      [characterId],
    );
    expect(ledger.rowCount).toBe(1);
    const audit = await pool.query(
      "SELECT * FROM audit_log WHERE character_id = $1 AND event_type = 'prey-list-reroll'",
      [characterId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it("refuses a reroll the bank cannot cover and writes nothing", async () => {
    await store.initialize(characterId, [makeSlot()]);
    await setBalance(characterId, 500);

    const result = await store.chargeListReroll(characterId, 10_000, makeSlot());
    expect(result.status).toBe("insufficient-gold");
    const balance = await pool.query<{ balance: string }>(
      "SELECT balance FROM bank_accounts WHERE character_id = $1",
      [characterId],
    );
    expect(Number(balance.rows[0]?.balance)).toBe(500);
    const ledger = await pool.query(
      "SELECT * FROM bank_ledger WHERE character_id = $1",
      [characterId],
    );
    expect(ledger.rowCount).toBe(0);
  });

  it("racing wildcard spends never overspend the balance", async () => {
    await store.initialize(characterId, [makeSlot()]);
    await setWildcards(characterId, 5);
    const record = makeSlot({ state: "list-selection" });

    const results = await Promise.all([
      settle(store.spendWildcards(characterId, 5, "prey-wildcard-list", record)),
      settle(store.spendWildcards(characterId, 5, "prey-wildcard-list", record)),
    ]);

    expect(results.filter((status) => status === "committed")).toHaveLength(1);
    const resources = await pool.query<{ wildcards: string }>(
      "SELECT wildcards FROM character_prey_resources WHERE character_id = $1",
      [characterId],
    );
    expect(Number(resources.rows[0]?.wildcards)).toBe(0);
  });

  it("caps wildcard grants at the store limit", async () => {
    await store.initialize(characterId, [makeSlot()]);
    await setWildcards(characterId, 48);
    const result = await store.grantWildcards(characterId, 10, 50);
    expect(result.wildcardsAfter).toBe(50);
  });
});
