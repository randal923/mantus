import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import type { RevealedGem } from "@tibia/protocol";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { PgGemStore } from "./PgGemStore";

const TEST_SCHEMA = "gem_store_integration";
const MIGRATION_LOCK_KEY = 7_281_004;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgGemStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`gem-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Gemmer ${label}`,
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

const seedResources = async (
  characterId: string,
  lesserGems: number,
  lesserFragments = 0,
): Promise<void> => {
  await pool.query(
    `INSERT INTO character_gem_resources (
       character_id, lesser_gems, lesser_fragments
     ) VALUES ($1, $2, $3)
     ON CONFLICT (character_id)
     DO UPDATE SET lesser_gems = $2, lesser_fragments = $3`,
    [characterId, lesserGems, lesserFragments],
  );
};

const makeGem = (): RevealedGem => ({
  id: randomUUID(),
  domain: "green",
  quality: "lesser",
  locked: false,
  basicModIds: [31],
});

/** Serializable races may also surface as thrown 40001s; treat as failure. */
const settle = async (
  operation: Promise<{ status: string }>,
): Promise<string> => operation.then((r) => r.status).catch(() => "conflict");

databaseDescribe("PgGemStore integration", () => {
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
      "018_pvp.sql",
      "019_houses.sql",
      "020_social.sql",
      "021_moderation.sql",
      "023_character_action_bar.sql",
      "029_character_potion_action_bar.sql",
      "028_gem_atelier.sql",
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
    store = new PgGemStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_gem_grades");
    await pool.query("DELETE FROM character_gems");
    await pool.query("DELETE FROM character_gem_resources");
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
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("reveals atomically: gold, gem count, gem row, ledger, audit", async () => {
    await setBalance(characterId, 200_000);
    await seedResources(characterId, 1);
    const gem = makeGem();
    const result = await store.reveal(characterId, "lesser", gem, 125_000);
    expect(result).toMatchObject({ status: "committed", goldAfter: 75_000 });
    const data = await store.load(characterId);
    expect(data.resources.lesserGems).toBe(0);
    expect(data.revealed).toHaveLength(1);
    expect(data.revealed[0]).toMatchObject({ id: gem.id, basicModIds: [31] });
    const ledger = await pool.query(
      "SELECT entry_type, amount FROM bank_ledger WHERE character_id = $1",
      [characterId],
    );
    expect(ledger.rows).toEqual([
      { entry_type: "gem-atelier", amount: "125000" },
    ]);
    const audit = await pool.query(
      `SELECT event_type FROM audit_log
       WHERE character_id = $1 AND event_type LIKE 'gem-%'`,
      [characterId],
    );
    expect(audit.rows).toEqual([{ event_type: "gem-reveal" }]);
  });

  it("rolls back the whole reveal when the bank cannot cover it", async () => {
    await setBalance(characterId, 100);
    await seedResources(characterId, 1);
    const result = await store.reveal(characterId, "lesser", makeGem(), 125_000);
    expect(result.status).toBe("insufficient-gold");
    const data = await store.load(characterId);
    expect(data.resources.lesserGems).toBe(1);
    expect(data.revealed).toHaveLength(0);
    expect(await store.bankBalance(characterId)).toBe(100);
  });

  it("lets exactly one of two racing reveals take the last unrevealed gem", async () => {
    await setBalance(characterId, 1_000_000);
    await seedResources(characterId, 1);
    const statuses = await Promise.all([
      settle(store.reveal(characterId, "lesser", makeGem(), 125_000)),
      settle(store.reveal(characterId, "lesser", makeGem(), 125_000)),
    ]);
    expect(statuses.filter((status) => status === "committed")).toHaveLength(1);
    const data = await store.load(characterId);
    expect(data.revealed).toHaveLength(1);
    expect(data.resources.lesserGems).toBe(0);
    expect(await store.bankBalance(characterId)).toBe(875_000);
  });

  it("lets exactly one of two racing destroys consume the gem", async () => {
    await setBalance(characterId, 1_000_000);
    await seedResources(characterId, 1);
    const gem = makeGem();
    await store.reveal(characterId, "lesser", gem, 125_000);
    const statuses = await Promise.all([
      settle(store.destroy(characterId, gem.id, "lesser", 3)),
      settle(store.destroy(characterId, gem.id, "lesser", 3)),
    ]);
    expect(statuses.filter((status) => status === "committed")).toHaveLength(1);
    const data = await store.load(characterId);
    expect(data.revealed).toHaveLength(0);
    expect(data.resources.lesserFragments).toBe(3);
  });

  it("refuses to destroy a locked or equipped gem", async () => {
    await setBalance(characterId, 1_000_000);
    await seedResources(characterId, 2);
    const locked = makeGem();
    await store.reveal(characterId, "lesser", locked, 125_000);
    await store.setLocked(characterId, locked.id, true);
    expect(
      (await store.destroy(characterId, locked.id, "lesser", 3)).status,
    ).toBe("gem-not-found");
    const equipped = makeGem();
    await store.reveal(characterId, "lesser", equipped, 125_000);
    await store.setEquipped(characterId, "green", equipped.id);
    expect(
      (await store.destroy(characterId, equipped.id, "lesser", 3)).status,
    ).toBe("gem-not-found");
  });

  it("applies exactly one of two racing grade improvements", async () => {
    await setBalance(characterId, 10_000_000);
    await seedResources(characterId, 0, 10);
    const statuses = await Promise.all([
      settle(store.improveGrade(characterId, "basic", 31, 1, 2_000_000, 5)),
      settle(store.improveGrade(characterId, "basic", 31, 1, 2_000_000, 5)),
    ]);
    expect(statuses.filter((status) => status === "committed")).toHaveLength(1);
    const data = await store.load(characterId);
    expect(data.grades.basic).toEqual([{ modId: 31, grade: 1 }]);
    expect(data.resources.lesserFragments).toBe(5);
    expect(await store.bankBalance(characterId)).toBe(8_000_000);
  });

  it("keeps one equipped gem per domain when re-equipping", async () => {
    await setBalance(characterId, 1_000_000);
    await seedResources(characterId, 2);
    const first = makeGem();
    const second = makeGem();
    await store.reveal(characterId, "lesser", first, 125_000);
    await store.reveal(characterId, "lesser", second, 125_000);
    await store.setEquipped(characterId, "green", first.id);
    await store.setEquipped(characterId, "green", second.id);
    const data = await store.load(characterId);
    expect(data.equipped).toEqual({ green: second.id });
    await store.setEquipped(characterId, "green", null);
    expect((await store.load(characterId)).equipped).toEqual({});
  });
});
